"""
Gera o LancadorNotas.exe (chamado pelo workflow com os mesmos argumentos do pyinstaller).

A tela de abertura do PyInstaller só mostra uma imagem parada. Aqui o script Tcl dela é trocado
por um que anima o mascote "pensando" e uma barra de carregando que anda de verdade:
- enquanto o .exe se descompacta, cada arquivo extraído avança a barra (e o tempo também, se o
  bootloader não avisar os arquivos);
- depois, o programa manda as fases ("Carregando o programa…", "Abrindo a janela…") e "@FIM"
  pelo abertura.py, a barra enche e a tela fecha.
"""
import base64
import io
import os
import sys

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))

# posições no splash.png (540×270)
PES = (140, 199)            # meio dos pés do mascote
BARRA = (262, 156, 230, 4)  # x, y, largura, altura
FASE = (262, 172)


def quadros_mascote(estado="pensando", escala=0.75):
    """Quadros do GIF em PNG base64 (pixels de 6 px, sem suavizar) e o tempo de cada um."""
    gif = Image.open(os.path.join(AQUI, "mascote", f"{estado}.gif"))
    caixa = None
    for i in range(gif.n_frames):
        gif.seek(i)
        b = gif.convert("RGBA").getbbox()
        caixa = b if caixa is None else (min(caixa[0], b[0]), min(caixa[1], b[1]), max(caixa[2], b[2]), max(caixa[3], b[3]))
    quadros, tempos = [], []
    for i in range(gif.n_frames):
        gif.seek(i)
        q = gif.convert("RGBA").crop(caixa)
        q = q.resize((round(q.width * escala), round(q.height * escala)), Image.NEAREST)
        buf = io.BytesIO()
        q.save(buf, format="PNG", optimize=True)
        quadros.append(base64.b64encode(buf.getvalue()).decode("ascii"))
        tempos.append(int(gif.info.get("duration") or 120))
    return quadros, tempos


# O Tcl do splash não carrega o init.tcl: nada de min()/max() (são procs de lá); só comandos em C.
ANIMACAO = r"""
proc menor {a b} { if {$a < $b} { return $a } else { return $b } }
proc maior {a b} { if {$a > $b} { return $a } else { return $b } }
set ::n 0
set ::fim 0
set ::atual 0.0
set ::t0 [clock milliseconds]
set ::total %(total)d
set ::tempos {%(tempos)s}
set ::quadros {}
foreach dados {%(quadros)s} { lappend ::quadros [image create photo -format png -data $dados] }
.root.canvas create image %(pes_x)d %(pes_y)d -anchor s -image [lindex $::quadros 0] -tag mascote
proc animar {i} {
    .root.canvas itemconfigure mascote -image [lindex $::quadros $i]
    after [lindex $::tempos $i] [list animar [expr {($i + 1) %% [llength $::quadros]}]]
}
animar 0

set ::bx %(bx)d
set ::by %(by)d
set ::bl %(bl)d
set ::ba %(ba)d
.root.canvas create rectangle $::bx $::by [expr {$::bx + $::bl}] [expr {$::by + $::ba}] -fill #1e2937 -outline "" -tag trilho
.root.canvas create rectangle $::bx $::by $::bx [expr {$::by + $::ba}] -fill #7db4f8 -outline "" -tag barra
.root.canvas create rectangle $::bx $::by $::bx [expr {$::by + $::ba}] -fill #b5d5fc -outline "" -tag brilho
.root.canvas create text %(fx)d %(fy)d -anchor nw -fill #66758a -font {{Segoe UI} 9} -text "Preparando os arquivos…" -tag fase

# status_text muda a cada arquivo extraído (bootloader) e com "@fase" vindo do programa
trace add variable status_text write marcar
proc marcar {args} {
    global status_text
    if {[string index $status_text 0] eq "@"} {
        set msg [string range $status_text 1 end]
        if {$msg eq "FIM"} { set ::fim 1 } else { .root.canvas itemconfigure fase -text $msg }
    } else {
        incr ::n
    }
}

proc passo {} {
    set seg [expr {([clock milliseconds] - $::t0) / 1000.0}]
    set por_arquivo [expr {0.75 * [menor 1.0 [expr {double($::n) / $::total}]]}]
    set por_tempo [expr {0.9 * (1.0 - exp(-$seg / 6.0))}]
    set alvo [expr {$::fim ? 1.0 : [maior $por_arquivo $por_tempo]}]
    set ::atual [expr {$::atual + ($alvo - $::atual) * ($::fim ? 0.35 : 0.08)}]
    set x [expr {$::bx + $::bl * $::atual}]
    set y1 [expr {$::by + $::ba}]
    .root.canvas coords barra $::bx $::by $x $y1
    set cheio [expr {$x - $::bx}]
    if {$cheio > 30} {
        set p [expr {fmod($seg * 0.8, 1.5) - 0.25}]
        set b0 [maior $::bx [menor $x [expr {$::bx + $cheio * $p}]]]
        set b1 [maior $::bx [menor $x [expr {$b0 + 28}]]]
        .root.canvas coords brilho $b0 $::by $b1 $y1
    } else {
        .root.canvas coords brilho $::bx $::by $::bx $y1
    }
    after 33 passo
}
passo
"""


def script_animado(total):
    from PyInstaller.building import splash_templates as t

    quadros, tempos = quadros_mascote()
    anim = ANIMACAO % {
        "total": max(total, 1), "tempos": " ".join(map(str, tempos)), "quadros": " ".join(quadros),
        "pes_x": PES[0], "pes_y": PES[1], "bx": BARRA[0], "by": BARRA[1], "bl": BARRA[2], "ba": BARRA[3],
        "fx": FASE[0], "fy": FASE[1],
    }
    return "\n".join([t.ipc_script, t.image_script, t.splash_canvas_setup, anim, t.transparent_setup,
                      t.pack_widgets, t.position_window_on_top, t.raise_window])


def trocar_script_do_splash():
    from PyInstaller.building import splash

    init_original = splash.Splash.__init__

    def init(self, image_file, binaries, datas, **kwargs):
        self._total_arquivos = len(binaries) + len(datas)
        init_original(self, image_file, binaries, datas, **kwargs)

    def generate_script(self):
        script = script_animado(getattr(self, "_total_arquivos", 1000))
        with open(self.script_name, "w", encoding="utf-8") as f:
            f.write(script)
        return script

    splash.Splash.__init__ = init
    splash.Splash.generate_script = generate_script


if __name__ == "__main__":
    import PyInstaller.__main__

    trocar_script_do_splash()
    PyInstaller.__main__.run(sys.argv[1:])
