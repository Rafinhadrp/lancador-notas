"""
Lançador de Notas · Rafinhadr
Programa do PC: recebe as notas enviadas pelo celular e preenche o sistema sozinho.
"""
import abertura  # primeiro de tudo: avisa a tela de abertura do .exe que o programa começou

import json
import os
import queue
import socket
import sys
import threading
import time
import traceback
from datetime import datetime, timezone

import customtkinter as ctk
from PIL import Image

from automacao import CAMPOS, PADRAO, Automacao, Parado
from central import VERSAO, Central, ErroCentral
from navegador import AutomacaoNavegador, FormularioAusente, Navegador
import atualizador
from consultas import ORDEM as SITES_CONSULTA, SITES, Consultor

try:
    import pyautogui
except Exception:  # pragma: no cover
    pyautogui = None

try:
    import keyboard  # atalhos globais (F9 / F10)
except Exception:  # pragma: no cover
    keyboard = None

# ---------------------------------------------------------------- aparência
BG = "#0b0f14"
SURFACE = "#141b23"
SURFACE_2 = "#1a232d"
BORDER = "#243040"
TEXT = "#e8eef5"
MUTED = "#93a1b2"
FAINT = "#66758a"
ACCENT = "#7db4f8"
ACCENT_HOVER = "#92c1fa"
ACCENT_INK = "#06121f"
OK = "#4fd1a1"
WARN = "#f2b45c"
DANGER = "#f07a6a"
FONTE = "Segoe UI" if sys.platform.startswith("win") else "Helvetica"

STATUS_TXT = {"pendente": "Na fila", "lancando": "Lançando", "lancada": "Lançada",
              "erro": "Atenção", "cancelada": "Cancelada"}
STATUS_COR = {"pendente": ACCENT, "lancando": WARN, "lancada": OK, "erro": DANGER, "cancelada": FAINT}

# ---------------------------------------------------------------- arquivos
PASTA_DADOS = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "LancadorNotas")
os.makedirs(PASTA_DADOS, exist_ok=True)
ARQ_CONFIG = os.path.join(PASTA_DADOS, "config.json")
ARQ_LOG = os.path.join(PASTA_DADOS, "registro.txt")


def recurso(nome):
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, nome)


def fonte(tamanho=14, peso="normal"):
    return ctk.CTkFont(family=FONTE, size=tamanho, weight=peso)


class Config:
    def __init__(self):
        self.dados = {"central": "", "usuario": "", "refresh_token": "", "ajustes": json.loads(json.dumps(PADRAO))}
        try:
            with open(ARQ_CONFIG, encoding="utf-8") as f:
                salvo = json.load(f)
            aj = salvo.get("ajustes", {})
            self.dados.update({k: v for k, v in salvo.items() if k != "ajustes"})
            self.dados["ajustes"].update({k: v for k, v in aj.items() if k not in ("posicoes", "recorte")})
            self.dados["ajustes"]["posicoes"].update(aj.get("posicoes", {}))
            self.dados["ajustes"]["recorte"].update(aj.get("recorte", {}))
        except (OSError, ValueError):
            pass

    @property
    def ajustes(self):
        return self.dados["ajustes"]

    def salvar(self):
        tmp = ARQ_CONFIG + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.dados, f, ensure_ascii=False, indent=2)
        os.replace(tmp, ARQ_CONFIG)


def numero_br(v):
    try:
        return float(str(v).replace(".", "").replace(",", "."))
    except ValueError:
        return 0.0


def moeda(n):
    return f"{n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def quando(iso):
    if not iso:
        return ""
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone()
    except ValueError:
        return ""
    agora = datetime.now().astimezone()
    if d.date() == agora.date():
        return "hoje " + d.strftime("%H:%M")
    return d.strftime("%d/%m %H:%M")


# ================================================================ trabalhador
class Trabalhador(threading.Thread):
    """Fica escutando a fila da central e lança as notas, uma de cada vez."""

    def __init__(self, app):
        super().__init__(daemon=True)
        self.app = app
        self.central = app.central
        self.fim = threading.Event()
        self.ultimo_batimento = 0
        self.nav = None  # navegador controlado (modo navegador); só esta thread mexe nele
        self.em_tarefa = False  # True enquanto pega/lança uma nota (a atualização espera terminar)
        self.consultor = None
        self.consultas_off_ate = 0       # tabela de consultas ainda não criada: tenta de novo mais tarde
        self.ultimo_teste_login = {}

    def modo_navegador(self):
        return self.app.config_.ajustes.get("modo") == "navegador"

    def garantir_navegador(self):
        """Abre a janela do navegador se ainda não estiver aberta. True = pronta."""
        if self.nav and self.nav.aberto():
            return True
        try:
            a = self.app.config_.ajustes
            if not self.nav:
                self.nav = Navegador(PASTA_DADOS, log=self.log, imprimir_direto=bool(a.get("imprimir_consultas")))
            self.nav.imprimir_direto = bool(a.get("imprimir_consultas"))
            self.nav.abrir(a.get("url_formulario", ""))
            self.consultor = None  # abas novas
            return True
        except Exception as e:
            self.log(f"✖ Não consegui abrir o navegador: {e}")
            registrar(traceback.format_exc())
            return False

    def ev(self, tipo, **dados):
        self.app.eventos.put((tipo, dados))

    def log(self, msg):
        self.ev("log", msg=msg)

    def run(self):
        central = self.central
        try:
            central.recuperar_presas()
        except Exception:
            pass
        try:
            central.recuperar_consultas_presas()
        except Exception:
            pass
        while not self.app.encerrando.is_set() and not self.fim.is_set():
            try:
                if self.app.reabrir_navegador.is_set():
                    self.app.reabrir_navegador.clear()
                    if self.nav and self.nav.aberto():
                        self.log("Reabrindo o navegador com o novo ajuste de impressão…")
                        self.nav.fechar()
                        self.consultor = None
                        self.garantir_navegador()
                if self.app.pedido_navegador.is_set():
                    self.app.pedido_navegador.clear()
                    if self.garantir_navegador() and self.nav:
                        self.nav.pagina_formulario(self.app.config_.ajustes.get("url_formulario", ""), esperar=0, trazer=True)
                if time.time() - self.ultimo_batimento > 8:
                    central.batimento(self.app.pausado.is_set())
                    self.ultimo_batimento = time.time()
                    self.ev("conexao", ok=True)
                if self.app.calibrando.is_set() or self.app.bloqueio_atualizacao.is_set():
                    time.sleep(0.4)
                    continue
                fez = False
                # 1) notas (têm prioridade)
                if not self.app.pausado.is_set():
                    pronto = True
                    if self.modo_navegador() and not (self.nav and self.nav.aberto()):
                        pronto = self.garantir_navegador()
                    if pronto:
                        self.em_tarefa = True
                        try:
                            nota = central.proxima_nota()
                            if nota:
                                self.processar(nota)
                                fez = True
                        finally:
                            self.em_tarefa = False
                # 2) consultas de veículo
                if not fez and not self.app.consultas_pausadas.is_set():
                    fez = self.tentar_consulta()
                if not fez:
                    if self.nav and self.nav.aberto():
                        self.nav.bombear(1.2)  # deixa salvar downloads feitos à mão na janela
                    else:
                        time.sleep(1.2)
            except ErroCentral as e:
                self.ev("conexao", ok=False, msg=str(e))
                time.sleep(5)
            except Exception as e:
                self.log(f"Erro inesperado: {e}")
                registrar(traceback.format_exc())
                time.sleep(5)
        if self.nav:
            self.nav.fechar()

    # ------------------------------------------------------------ consultas (Detran / IPVA)
    def pasta_consultas(self):
        pasta = self.app.config_.ajustes.get("pasta_consultas") or os.path.join(
            os.path.expanduser("~"), "Documents", "Consultas Lançador")
        os.makedirs(pasta, exist_ok=True)
        return pasta

    def _verificar_logins(self):
        """Site esperando login: quando a pessoa voltar logada, a consulta continua sozinha."""
        c = self.consultor
        for site in SITES_CONSULTA:
            if not c.precisa_login[site] or time.time() - self.ultimo_teste_login.get(site, 0) < 6:
                continue
            self.ultimo_teste_login[site] = time.time()
            try:
                pg = c.aba(site)
                dominio = SITES[site]["url"].split("/")[2].split(".", 1)[-1]
                if c.pede_login(pg, SITES[site]) or dominio not in (pg.url or ""):
                    continue  # ainda no gov.br / captcha: não mexe na aba
                c.abrir_formulario(site, esperar=8)
                c.precisa_login[site] = False
                self.log(f"✔ {SITES[site]['nome']}: login feito, continuando as consultas.")
                self.ev("login_ok", site=site)
            except Exception:
                pass

    def tentar_consulta(self):
        if not self.app.config_.ajustes.get("consultas_no_programa"):
            return False  # feitas pela extensão do Chrome
        if time.time() < self.consultas_off_ate:
            return False
        central = self.central
        try:
            if not (self.nav and self.nav.aberto()):
                if not central.tem_consulta_pendente() or not self.garantir_navegador():
                    return False
            if self.consultor is None:
                self.consultor = Consultor(self.nav, self.app.config_.ajustes, log=self.log)
            c = self.consultor
            self._verificar_logins()
            livres = [s for s in SITES_CONSULTA if not c.precisa_login[s] and time.time() >= c.fora_ate[s]]
            consulta = central.proxima_consulta(livres)
        except ErroCentral as e:
            if "consultas" in str(e):
                self.consultas_off_ate = time.time() + 600
                self.log("Consultas: o banco ainda não tem a tabela (rode o supabase/schema.sql atualizado).")
                return False
            raise
        if not consulta:
            return False

        self.em_tarefa = True
        self.ev("consultando", consulta=consulta)
        self.log(f"🔎 {consulta['placa']} · Renavam {consulta['renavam']}")
        c.parar.clear()
        self.app.pular_consulta.clear()
        self.app.automacao = c
        try:
            r = c.processar(consulta, livres, self.pasta_consultas())
        except Parado:
            self.app.automacao = None
            self.em_tarefa = False
            if self.app.pular_consulta.is_set():
                self.app.pular_consulta.clear()
                central.atualizar_consulta(consulta["id"], {"status": "erro", "mensagem": "Pulada no PC."})
                self.log("↷ Consulta pulada.")
                self.ev("consulta_fim")
                return True
            central.atualizar_consulta(consulta["id"], {"status": "pendente", "mensagem": ""})
            self.app.consultas_pausadas.set()
            self.log("■ Consultas paradas por você. A consulta voltou para a fila.")
            self.ev("consultas_pausadas")
            return True
        except Exception as e:
            self.app.automacao = None
            self.em_tarefa = False
            registrar(traceback.format_exc())
            central.atualizar_consulta(consulta["id"], {"status": "erro", "mensagem": f"Erro no PC: {e}"})
            self.log(f"✖ Erro na consulta: {e}")
            self.ev("consulta_fim")
            return True
        self.app.automacao = None
        self.em_tarefa = False

        campos = {"detran_status": r["detran_status"], "ipva_status": r["ipva_status"],
                  "arquivos": "\n".join(r["arquivos"]), "mensagem": " · ".join(r["mensagens"])}
        faltam = [s for s in SITES_CONSULTA if r[f"{s}_status"] == ""]
        if faltam:
            # algum site ainda sem resposta (login, fora do ar ou pausado): volta para a fila só com o que falta
            avisos = []
            if r["login"]:
                avisos.append("Esperando login no " + " e ".join(SITES[s]["nome"] for s in r["login"]))
            if r["fora"]:
                avisos.append(" e ".join(SITES[s]["nome"] for s in r["fora"]) + " não abriu; tento de novo em instantes")
            outros = [s for s in faltam if s not in r["login"] and s not in r["fora"]]
            if outros:
                avisos.append("Falta consultar no " + " e ".join(SITES[s]["nome"] for s in outros))
            campos["status"] = "pendente"
            campos["mensagem"] = " · ".join(r["mensagens"] + avisos)
            for s in r["login"]:
                try:
                    c.aba(s).bring_to_front()
                except Exception:
                    pass
            if r["login"]:
                self.ev("login_consulta", sites=r["login"])
        elif "erro" in (r["detran_status"], r["ipva_status"]):
            campos["status"] = "erro"
            self.log(f"⚠ {consulta['placa']}: {campos['mensagem']}")
        else:
            campos["status"] = "pronta"
            self.log(f"✔ {consulta['placa']}: consultas prontas.")
        central.atualizar_consulta(consulta["id"], campos)
        self.ev("consulta_fim")
        try:
            c._dormir(float(self.app.config_.ajustes.get("intervalo_consultas", 3)))
        except Parado:
            pass
        return True

    def processar(self, nota):
        central, cfg = self.central, self.app.config_
        ajustes = cfg.ajustes
        self.ev("lancando", nota=nota)
        self.log(f"▶ {nota['placa']} · R$ {nota['valor']} · {nota['descricao'][:60]}")
        if self.modo_navegador():
            auto = AutomacaoNavegador(ajustes, self.nav, log=self.log)
        else:
            auto = Automacao(ajustes, central, log=self.log)
        self.app.automacao = auto
        try:
            r = auto.lancar(nota)
            if self.modo_navegador():
                cfg.salvar()  # guarda o endereço do formulário
        except FormularioAusente as e:
            central.concluir(nota["id"], "pendente", "Esperando a tela de lançamento no PC.")
            self.app.pausado.set()
            self.ev("pausado")
            self.log(f"■ {e} Depois clique em Retomar.")
            if self.nav:
                self.nav.pagina_formulario(esperar=0, trazer=True)
            return
        except (Parado, getattr(pyautogui, "FailSafeException", Parado)):
            central.concluir(nota["id"], "pendente", "Interrompida no PC; volta a lançar quando você retomar.")
            self.app.pausado.set()
            self.ev("pausado")
            self.log("■ Parado por você. A nota voltou para a fila e o programa foi pausado.")
            return
        except Exception as e:
            central.concluir(nota["id"], "erro", f"Erro ao preencher: {e}")
            self.log(f"✖ Erro ao preencher: {e}")
            self.ev("pronto")
            return
        finally:
            self.app.automacao = None

        if r["salvo"]:
            central.concluir(nota["id"], "lancada", "")
            self.log("✔ Lançada e salva.")
            self.ev("lancada")
            time.sleep(float(ajustes["espera_entre_notas"]))
        else:
            motivo = "Confira e clique em Salvar no sistema." if r["veiculo_ok"] else \
                "Não achei o veículo na lista. Escolha o carro e clique em Salvar."
            self.ev("aguardando", nota=nota, motivo=motivo)
            self.log(f"⚠ {motivo}")
            self.app.pular.clear()
            auto2 = auto if self.modo_navegador() else Automacao(ajustes, central)
            auto2.parar.clear()
            self.app.automacao = auto2
            salvou = auto2.esperar_salvar(self.app.pular)
            self.app.automacao = None
            self.app.pular.clear()
            if salvou:
                msg = "" if r["veiculo_ok"] else "Veículo escolhido manualmente."
                central.concluir(nota["id"], "lancada", msg)
                self.log("✔ Salva por você.")
                self.ev("lancada")
                time.sleep(float(ajustes["espera_entre_notas"]))
            else:
                central.concluir(nota["id"], "erro", ("Veículo não encontrado. " if not r["veiculo_ok"] else "") + "Pulada no PC.")
                self.log("↷ Pulada.")
        self.ev("pronto")


class Mascote:
    """Mascote <R/> animado (GIF em pixel art) num Label do tkinter, sem suavizar os pixels."""

    _cache = {}

    def __init__(self, master, tamanho=64, estado="parado", fundo=SURFACE, cortar_baixo=0):
        import tkinter as tk
        self.tamanho = tamanho
        self.cortar = cortar_baixo  # linhas vazias (de 32) tiradas de baixo: os pés encostam onde ele "senta"
        self.label = tk.Label(master, bg=fundo, bd=0, highlightthickness=0)
        self.estado = ""
        self.quadros = []
        self.i = 0
        self._apos = None
        self.feliz_ate = 0
        self.depois = None
        self.definir(estado)

    def pack(self, **kw):
        self.label.pack(**kw)
        return self

    def _carregar(self, estado):
        chave = (estado, self.tamanho, self.cortar)
        if chave not in Mascote._cache:
            from PIL import ImageSequence, ImageTk
            quadros = []
            try:
                g = Image.open(recurso(os.path.join("mascote", f"{estado}.gif")))
                for q in ImageSequence.Iterator(g):
                    img = q.convert("RGBA")
                    if self.cortar:
                        img = img.crop((0, 0, img.width, img.height - img.height * self.cortar // 32))
                    altura = self.tamanho * img.height // img.width
                    img = img.resize((self.tamanho, altura), Image.NEAREST)
                    quadros.append((ImageTk.PhotoImage(img), int(q.info.get("duration", 120))))
            except Exception:
                registrar(traceback.format_exc())
            Mascote._cache[chave] = quadros
        return Mascote._cache[chave]

    def definir(self, estado, temporario=False):
        if temporario:
            self.feliz_ate = time.time() + 3
        elif time.time() < self.feliz_ate:
            self.depois = estado
            return
        if estado == self.estado:
            return
        self.estado = estado
        self.quadros = self._carregar(estado)
        self.i = 0
        if self._apos:
            try:
                self.label.after_cancel(self._apos)
            except Exception:
                pass
        self._quadro()

    def _quadro(self):
        if not self.quadros or not self.label.winfo_exists():
            return
        img, dur = self.quadros[self.i % len(self.quadros)]
        self.label.configure(image=img)
        self.i += 1
        if self.feliz_ate and time.time() > self.feliz_ate:
            self.feliz_ate = 0
            volta, self.depois = self.depois or "parado", None
            self.estado = ""
            self.definir(volta)
            return
        self._apos = self.label.after(max(80, dur), self._quadro)


def registrar(texto):
    try:
        with open(ARQ_LOG, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now():%d/%m/%Y %H:%M:%S}] {texto}\n")
    except OSError:
        pass


# ================================================================ componentes visuais
def cartao(master, **kw):
    return ctk.CTkFrame(master, fg_color=SURFACE, corner_radius=14, border_width=1, border_color=BORDER, **kw)


def botao(master, texto, comando, tipo="normal", **kw):
    estilos = {
        "primario": dict(fg_color=ACCENT, hover_color=ACCENT_HOVER, text_color=ACCENT_INK, border_width=0),
        "normal": dict(fg_color=SURFACE_2, hover_color="#223040", text_color=TEXT, border_width=1, border_color=BORDER),
        "perigo": dict(fg_color=SURFACE_2, hover_color="#3a2321", text_color=DANGER, border_width=1, border_color=BORDER),
        "fantasma": dict(fg_color="transparent", hover_color=SURFACE_2, text_color=MUTED, border_width=0),
    }
    opcoes = dict(height=38, corner_radius=10, font=fonte(13, "bold"))
    opcoes.update(estilos[tipo])
    opcoes.update(kw)
    return ctk.CTkButton(master, text=texto, command=comando, **opcoes)


def entrada(master, **kw):
    opcoes = dict(height=40, corner_radius=10, fg_color="#10161d", border_color=BORDER, text_color=TEXT, font=fonte(14))
    opcoes.update(kw)
    return ctk.CTkEntry(master, **opcoes)


def rotulo(master, texto, tam=13, peso="normal", cor=TEXT, **kw):
    return ctk.CTkLabel(master, text=texto, font=fonte(tam, peso), text_color=cor, **kw)


# ================================================================ aplicativo
class App(ctk.CTk):
    def __init__(self):
        super().__init__(fg_color=BG)
        ctk.set_appearance_mode("dark")
        self.title("Lançador de Notas · Rafinhadr")
        self.geometry("1040x680")
        self.minsize(900, 600)
        self._icone()

        self.config_ = Config()
        self.central = None
        self.eventos = queue.Queue()
        self.encerrando = threading.Event()
        self.pausado = threading.Event()
        self.calibrando = threading.Event()
        self.pular = threading.Event()
        self.pedido_navegador = threading.Event()
        self.consultas_pausadas = threading.Event()
        self.pular_consulta = threading.Event()
        self.reabrir_navegador = threading.Event()
        self.bloqueio_atualizacao = threading.Event()  # não pega notas novas (atualizando ou versão obrigatória)
        self.info_versao = None
        self.baixando_versao = False
        self.automacao = None
        self.trabalhador = None
        self.ocupado = False

        logo = Image.open(recurso("logo.png"))
        mini = logo.convert("RGBA")
        mini.putalpha(mini.getchannel("A").point(lambda a: a * 55 // 100))  # logo bem discreta
        self.logo_mini = ctk.CTkImage(dark_image=mini, light_image=mini, size=(int(15 * logo.width / logo.height), 15))
        self.logo_grande = ctk.CTkImage(dark_image=logo, light_image=logo, size=(150, int(150 * logo.height / logo.width)))
        self.logo_peq = ctk.CTkImage(dark_image=logo, light_image=logo, size=(96, int(96 * logo.height / logo.width)))

        self.protocol("WM_DELETE_WINDOW", self.fechar)
        self.after(150, self._bombear_eventos)
        self.after(300, abertura.fechar)  # a janela já apareceu: some a tela de abertura

        if self.config_.dados.get("refresh_token") and self.config_.dados.get("central"):
            self.tela_conectando()
            threading.Thread(target=self._login_automatico, daemon=True).start()
        else:
            self.tela_login()

        if keyboard:
            try:
                keyboard.add_hotkey("f10", self.parar_agora)
            except Exception:
                pass

    def _icone(self):
        try:
            if sys.platform.startswith("win"):
                self.after(250, lambda: self.iconbitmap(recurso("icone.ico")))
            else:
                from PIL import ImageTk
                self._ico = ImageTk.PhotoImage(Image.open(recurso("icone.png")))
                self.iconphoto(True, self._ico)
        except Exception:
            pass

    def limpar(self):
        for w in self.winfo_children():
            w.destroy()

    # ------------------------------------------------------------ login
    def _assinatura(self, master):
        """Logo discreta junto do "feito por Rafinhadr"."""
        f = ctk.CTkFrame(master, fg_color="transparent")
        ctk.CTkLabel(f, text="", image=self.logo_mini).pack(side="left", padx=(0, 8))
        rotulo(f, f"feito por Rafinhadr · v{VERSAO}", 11, cor=FAINT).pack(side="left")
        return f

    def tela_conectando(self):
        self.limpar()
        f = ctk.CTkFrame(self, fg_color="transparent")
        f.place(relx=.5, rely=.5, anchor="center")
        Mascote(f, 128, "pensando", fundo=BG).pack(pady=(0, 6))
        rotulo(f, "Conectando à central…", 14, cor=MUTED).pack()
        self._assinatura(f).pack(pady=(28, 0))

    def _login_automatico(self):
        c = Central(self.config_.dados["central"])
        try:
            c.entrar_com_token(self.config_.dados["refresh_token"])
            self.eventos.put(("logado", {"central": c}))
        except Exception as e:
            self.eventos.put(("login_falhou", {"msg": str(e)}))

    def tela_login(self, erro=""):
        self.limpar()
        caixa = ctk.CTkFrame(self, fg_color="transparent")
        caixa.place(relx=.5, rely=.5, anchor="center")
        rotulo(caixa, "Lançador de Notas", 24, "bold").pack()
        rotulo(caixa, "Entre com o mesmo usuário que você usa no celular.", 13, cor=MUTED).pack(pady=(2, 0))

        c = cartao(caixa)
        c.pack(fill="x", pady=(92, 0))
        # o mascote fica sentado na borda de cima do cartão, com um balão de "bom dia"
        self.mascote_login = Mascote(caixa, 96, "acenando", fundo=BG, cortar_baixo=7)
        self.mascote_login.label.place(in_=c, relx=.5, rely=0, anchor="s")
        h = datetime.now().hour
        ctk.CTkLabel(caixa, text="Bom dia!" if h < 12 else "Boa tarde!" if h < 18 else "Boa noite!",
                     font=fonte(12, "bold"), text_color=TEXT, fg_color=SURFACE_2, corner_radius=10,
                     height=26).place(in_=c, relx=.5, x=44, rely=0, y=-58, anchor="w")
        dentro = ctk.CTkFrame(c, fg_color="transparent")
        dentro.pack(padx=20, pady=20, fill="x")

        def campo(texto, **kw):
            rotulo(dentro, texto, 12, cor=MUTED, anchor="w").pack(fill="x", pady=(8, 4))
            e = entrada(dentro, width=320, **kw)
            e.pack(fill="x")
            return e

        e_central = campo("Endereço da central", placeholder_text="ex.: lancador-notas.vercel.app")
        e_usuario = campo("Usuário")
        e_senha = campo("Senha", show="•")
        if self.config_.dados.get("central"):
            e_central.insert(0, self.config_.dados["central"])
        if self.config_.dados.get("usuario"):
            e_usuario.insert(0, self.config_.dados["usuario"])

        msg = rotulo(dentro, erro, 12, cor=DANGER, wraplength=320, justify="left")
        msg.pack(fill="x", pady=(10, 0))

        def entrar(*_):
            end, usu, sen = e_central.get().strip(), e_usuario.get().strip(), e_senha.get()
            if not end or not usu or not sen:
                msg.configure(text="Preencha os três campos.")
                return
            b.configure(state="disabled", text="Entrando…")
            msg.configure(text="")
            self.mascote_login.definir("digitando")

            def tarefa():
                cen = Central(end)
                try:
                    cen.entrar(usu, sen)
                    self.eventos.put(("logado", {"central": cen, "usuario": usu}))
                except Exception as e:
                    self.eventos.put(("login_erro", {"msg": str(e), "widgets": (b, msg)}))
            threading.Thread(target=tarefa, daemon=True).start()

        b = botao(dentro, "Entrar", entrar, "primario", height=44)
        b.pack(fill="x", pady=(14, 0))
        for e in (e_central, e_usuario, e_senha):
            e.bind("<Return>", entrar)
        (e_senha if self.config_.dados.get("usuario") else e_central).focus_set()
        self._assinatura(caixa).pack(pady=(20, 0))

    def logado(self, central, usuario=None):
        self.central = central
        self.config_.dados["central"] = central.endereco
        self.config_.dados["refresh_token"] = central.refresh_token
        if usuario:
            self.config_.dados["usuario"] = usuario
        self.config_.salvar()
        self.montar_principal()
        self.trabalhador = Trabalhador(self)
        self.trabalhador.start()
        falha = atualizador.limpar_restos(PASTA_DADOS)
        if falha:
            self.log(f"⚠ {falha} Continuo na versão {VERSAO}.")
        if not getattr(self, "_verificador", None):
            self._verificador = threading.Thread(target=self._verificar_versao_loop, daemon=True)
            self._verificador.start()
        threading.Thread(target=self._salvar_token_periodico, daemon=True).start()
        self.atualizar_numeros()

    def _salvar_token_periodico(self):
        ultimo = ""
        central = self.central
        while not self.encerrando.is_set() and self.central is central:
            if central.refresh_token != ultimo:
                ultimo = central.refresh_token
                self.config_.dados["refresh_token"] = ultimo
                try:
                    self.config_.salvar()
                except OSError:
                    pass
            time.sleep(20)

    def sair(self):
        if self.ocupado:
            from tkinter import messagebox
            if not messagebox.askyesno("Lançador de Notas", "Uma nota está sendo lançada agora. Sair mesmo assim?"):
                return
            if self.automacao:
                self.automacao.parar.set()
        if self.trabalhador:
            self.trabalhador.fim.set()
            self.trabalhador = None
        self.config_.dados["refresh_token"] = ""
        self.config_.salvar()
        self.central = None
        self.pausado.clear()
        self.tela_login()

    # ------------------------------------------------------------ estrutura principal
    def montar_principal(self):
        self.limpar()
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        lateral = ctk.CTkFrame(self, fg_color="#0e141a", corner_radius=0, width=220, border_width=0)
        lateral.grid(row=0, column=0, sticky="nsw")
        lateral.grid_propagate(False)
        ctk.CTkLabel(lateral, text="", image=self.logo_peq).pack(pady=(24, 4))
        rotulo(lateral, "LANÇADOR DE NOTAS", 11, "bold", cor=FAINT).pack(pady=(0, 22))

        self.paginas = {}
        self.botoes_nav = {}
        area = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        area.grid(row=0, column=1, sticky="nsew")
        area.grid_columnconfigure(0, weight=1)
        area.grid_rowconfigure(0, weight=1)

        for chave, titulo, construtor in (
            ("inicio", "Início", self.pag_inicio),
            ("calibragem", "Calibragem", self.pag_calibragem),
            ("ajustes", "Ajustes", self.pag_ajustes),
            ("historico", "Histórico", self.pag_historico),
        ):
            b = ctk.CTkButton(lateral, text=titulo, anchor="w", height=42, corner_radius=10,
                              font=fonte(14, "bold"), fg_color="transparent", hover_color=SURFACE_2,
                              text_color=MUTED, command=lambda k=chave: self.ir(k))
            b.pack(fill="x", padx=14, pady=3)
            self.botoes_nav[chave] = b
            p = ctk.CTkFrame(area, fg_color=BG, corner_radius=0)
            p.grid(row=0, column=0, sticky="nsew")
            construtor(p)
            self.paginas[chave] = p

        rodape = ctk.CTkFrame(lateral, fg_color="transparent")
        rodape.pack(side="bottom", fill="x", padx=14, pady=16)
        rotulo(rodape, self.central.perfil.get("nome", ""), 13, "bold", anchor="w").pack(fill="x")
        rotulo(rodape, f"{self.central.maquina} · v{VERSAO}", 11, cor=FAINT, anchor="w").pack(fill="x", pady=(0, 8))
        botao(rodape, "Sair", self.sair, "fantasma", anchor="w").pack(fill="x")

        self.ir("inicio")

    def ir(self, chave):
        for k, b in self.botoes_nav.items():
            ativo = k == chave
            b.configure(fg_color=SURFACE_2 if ativo else "transparent", text_color=ACCENT if ativo else MUTED)
        self.paginas[chave].tkraise()
        if chave == "historico":
            self.carregar_historico()

    def cabecalho(self, master, titulo, sub):
        rotulo(master, titulo, 24, "bold", anchor="w").pack(fill="x", padx=32, pady=(28, 0))
        rotulo(master, sub, 13, cor=MUTED, anchor="w", justify="left", wraplength=720).pack(fill="x", padx=32, pady=(2, 18))

    # ------------------------------------------------------------ página: início
    def pag_inicio(self, p):
        self.cabecalho(p, "Início", "Deixe este programa aberto. Ele lança sozinho as notas que você manda pelo celular.")

        self.area_faixa = ctk.CTkFrame(p, fg_color="transparent", height=1)
        self.area_faixa.pack(fill="x", padx=32)
        self.mostrar_faixa_versao()

        st = cartao(p)
        st.pack(fill="x", padx=32)
        linha = ctk.CTkFrame(st, fg_color="transparent")
        linha.pack(fill="x", padx=20, pady=18)
        self.st_mascote = Mascote(linha, 64, "parado").pack(side="left", padx=(0, 14))
        textos = ctk.CTkFrame(linha, fg_color="transparent")
        textos.pack(side="left", fill="x", expand=True)
        self.st_titulo = rotulo(textos, "Pronto", 18, "bold", anchor="w")
        self.st_titulo.pack(fill="x")
        self.st_sub = rotulo(textos, "Aguardando notas do celular…", 13, cor=MUTED, anchor="w", justify="left", wraplength=520)
        self.st_sub.pack(fill="x")
        acoes = ctk.CTkFrame(linha, fg_color="transparent")
        acoes.pack(side="right")
        self.b_pular = botao(acoes, "Pular esta nota", self.pular.set, "normal")
        self.b_pausar = botao(acoes, "Pausar", self.alternar_pausa, "normal", width=110)
        self.b_pausar.pack(side="right", padx=(8, 0))
        if self.config_.ajustes.get("modo") == "navegador":
            botao(acoes, "Abrir navegador", self.pedido_navegador.set, "normal").pack(side="right", padx=(8, 0))

        nums = ctk.CTkFrame(p, fg_color="transparent")
        nums.pack(fill="x", padx=32, pady=14)
        self.n_lancadas = self._numero(nums, "0", "lançadas hoje")
        self.n_total = self._numero(nums, "0,00", "total hoje (R$)")
        self.n_fila = self._numero(nums, "0", "na fila")

        cc = cartao(p)
        cc.pack(fill="x", padx=32, pady=(0, 12))
        linha_c = ctk.CTkFrame(cc, fg_color="transparent")
        linha_c.pack(fill="x", padx=20, pady=14)
        self.cs_ponto = rotulo(linha_c, "●", 22, cor=FAINT)
        self.cs_ponto.pack(side="left", padx=(0, 12))
        tx = ctk.CTkFrame(linha_c, fg_color="transparent")
        tx.pack(side="left", fill="x", expand=True)
        self.cs_titulo = rotulo(tx, "Consultas de veículo", 15, "bold", anchor="w")
        self.cs_titulo.pack(fill="x")
        self.cs_sub = rotulo(tx, "Consultas: 0 na fila · 0 prontas hoje", 12, cor=MUTED, anchor="w", justify="left", wraplength=520)
        self.cs_sub.pack(fill="x")
        ac = ctk.CTkFrame(linha_c, fg_color="transparent")
        ac.pack(side="right")
        self.b_pular_consulta = botao(ac, "Pular consulta", self.pular_consulta_agora, "normal")
        self.b_pausar_consultas = botao(ac, "Retomar consultas" if self.consultas_pausadas.is_set() else "Pausar consultas",
                                        self.alternar_pausa_consultas, "normal", width=150)
        self.b_pausar_consultas.pack(side="right", padx=(8, 0))
        self._cs_fila, self._cs_prontas, self._cs_logins = 0, 0, set()

        rotulo(p, "Atividade", 13, "bold", cor=MUTED, anchor="w").pack(fill="x", padx=32, pady=(4, 6))
        self.caixa_log = ctk.CTkTextbox(p, fg_color=SURFACE, border_color=BORDER, border_width=1, corner_radius=14,
                                        text_color=TEXT, font=ctk.CTkFont(family="Consolas" if FONTE == "Segoe UI" else "Courier", size=12))
        self.caixa_log.pack(fill="both", expand=True, padx=32)
        self.caixa_log.configure(state="disabled")
        rotulo(p, "Para parar na hora: aperte F10" + ("." if self.config_.ajustes.get("modo") == "navegador" else " ou jogue o mouse no canto superior esquerdo da tela."), 12, cor=FAINT,
               anchor="w").pack(fill="x", padx=32, pady=(8, 18))
        self.log("Conectado como " + self.central.perfil.get("nome", "") + ". Aguardando notas.")

    def _numero(self, master, valor, legenda):
        c = cartao(master)
        c.pack(side="left", fill="x", expand=True, padx=(0, 10))
        v = rotulo(c, valor, 22, "bold", anchor="w")
        v.pack(fill="x", padx=16, pady=(12, 0))
        rotulo(c, legenda, 12, cor=FAINT, anchor="w").pack(fill="x", padx=16, pady=(0, 12))
        return v

    def log(self, msg):
        registrar(msg)
        if not hasattr(self, "caixa_log") or not self.caixa_log.winfo_exists():
            return
        self.caixa_log.configure(state="normal")
        self.caixa_log.insert("end", f"{datetime.now():%H:%M:%S}  {msg}\n")
        linhas = int(self.caixa_log.index("end-1c").split(".")[0])
        if linhas > 400:
            self.caixa_log.delete("1.0", f"{linhas - 400}.0")
        self.caixa_log.see("end")
        self.caixa_log.configure(state="disabled")

    def status(self, titulo, sub, cor):
        if hasattr(self, "st_titulo") and self.st_titulo.winfo_exists():
            self.st_titulo.configure(text=titulo)
            self.st_sub.configure(text=sub)
            humor = ("digitando" if titulo.startswith("Lançando") else "pensando" if titulo.startswith("Esperando")
                     else "dormindo" if titulo.startswith("Pausado") else "erro" if cor == DANGER or "obrigatória" in titulo
                     else "parado")
            self.st_mascote.definir(humor)

    def alternar_pausa(self):
        if self.pausado.is_set():
            self.pausado.clear()
            self.b_pausar.configure(text="Pausar")
            self.status("Pronto", "Aguardando notas do celular…", OK)
            self.log("Retomado.")
        else:
            self.pausado.set()
            self.b_pausar.configure(text="Retomar")
            self.status("Pausado", "As notas ficam na fila até você retomar.", WARN)
            self.log("Pausado.")
        if self.trabalhador:
            self.trabalhador.ultimo_batimento = 0  # avisa o celular na hora

    def alternar_pausa_consultas(self):
        if self.consultas_pausadas.is_set():
            self.consultas_pausadas.clear()
            self.log("Consultas retomadas.")
        else:
            self.consultas_pausadas.set()
            self.log("Consultas pausadas (as notas continuam).")
        self.b_pausar_consultas.configure(text="Retomar consultas" if self.consultas_pausadas.is_set() else "Pausar consultas")
        self.mostrar_consultas()

    def pular_consulta_agora(self):
        self.pular_consulta.set()
        if self.automacao is not None and self.automacao.__class__.__name__ == "Consultor":
            self.automacao.parar.set()

    def mostrar_consultas(self, titulo=None, cor=None):
        if not getattr(self, "cs_titulo", None) or not self.cs_titulo.winfo_exists():
            return
        resumo = f"Consultas: {self._cs_fila} na fila · {self._cs_prontas} prontas hoje"
        if not self.config_.ajustes.get("consultas_no_programa"):
            self.b_pausar_consultas.pack_forget()
            titulo = titulo if titulo and titulo.startswith("Consultando") else "Consultas pela extensão do Chrome"
            cor = cor or (OK if self._cs_fila else FAINT)
        elif self._cs_logins:
            nomes = " e ".join(SITES[s]["nome"] for s in SITES_CONSULTA if s in self._cs_logins)
            titulo, cor = f"Faça login de novo no {nomes}", WARN
            resumo = f"Entre com o gov.br na aba do {nomes} da janela do Lançador. As consultas continuam sozinhas. · " + resumo
        elif self.consultas_pausadas.is_set():
            titulo, cor = titulo or "Consultas pausadas", WARN
        self.cs_titulo.configure(text=titulo or "Consultas de veículo")
        self.cs_sub.configure(text=resumo)
        self.cs_ponto.configure(text_color=cor or (OK if self._cs_fila else FAINT))

    def parar_agora(self):
        if self.automacao:
            self.automacao.parar.set()
        self.pular.set()

    def atualizar_numeros(self):
        if not self.central or self.encerrando.is_set():
            return

        def tarefa():
            try:
                inicio = datetime.now().astimezone().replace(hour=0, minute=0, second=0, microsecond=0)
                lanc = self.central.contar("lancada", inicio.astimezone(timezone.utc).isoformat())
                fila = self.central.contar("pendente")
                extra = {}
                try:
                    extra["cs_fila"] = len(self.central.contar_consultas("pendente")) + len(self.central.contar_consultas("consultando"))
                    extra["cs_prontas"] = len(self.central.contar_consultas("pronta", inicio.astimezone(timezone.utc).isoformat()))
                except Exception:
                    pass
                self.eventos.put(("numeros", {"lanc": lanc, "fila": fila, **extra}))
            except Exception:
                pass
        threading.Thread(target=tarefa, daemon=True).start()
        self.after(15000, self.atualizar_numeros)

    # ------------------------------------------------------------ página: calibragem
    def pag_calibragem(self, p):
        rolagem = ctk.CTkScrollableFrame(p, fg_color=BG, corner_radius=0)
        rolagem.pack(fill="both", expand=True)
        self.cabecalho(rolagem, "Calibragem",
                       "Abra o formulário “Nova Receita e Despesa de Veículo” no Chrome, do jeito que você usa no dia a dia. "
                       "Clique em Capturar, coloque o mouse em cima do campo e aperte F9.")
        self.cal_aviso = rotulo(rolagem, "", 13, "bold", cor=ACCENT, anchor="w")
        self.cal_aviso.pack(fill="x", padx=32, pady=(0, 8))

        self.ent_pos = {}
        c = cartao(rolagem)
        c.pack(fill="x", padx=32)
        for i, (chave, nome, dica) in enumerate(CAMPOS):
            linha = ctk.CTkFrame(c, fg_color="transparent")
            linha.pack(fill="x", padx=18, pady=(14 if i == 0 else 6, 14 if i == len(CAMPOS) - 1 else 6))
            textos = ctk.CTkFrame(linha, fg_color="transparent", width=230)
            textos.pack(side="left")
            textos.pack_propagate(False)
            textos.configure(height=44)
            rotulo(textos, nome, 14, "bold", anchor="w").pack(fill="x")
            rotulo(textos, dica, 11, cor=FAINT, anchor="w").pack(fill="x")
            ex = entrada(linha, width=78, justify="center")
            ey = entrada(linha, width=78, justify="center")
            rotulo(linha, "X", 12, cor=FAINT).pack(side="left", padx=(6, 4))
            ex.pack(side="left")
            rotulo(linha, "Y", 12, cor=FAINT).pack(side="left", padx=(12, 4))
            ey.pack(side="left")
            x, y = self.config_.ajustes["posicoes"][chave]
            ex.insert(0, str(x))
            ey.insert(0, str(y))
            for e in (ex, ey):
                e.bind("<FocusOut>", lambda _e: self.salvar_posicoes(silencioso=True))
            botao(linha, "Testar", lambda k=chave: self.testar_posicao(k), "fantasma", width=80).pack(side="right")
            botao(linha, "Capturar", lambda k=chave: self.capturar([k]), "normal", width=100).pack(side="right", padx=(8, 4))
            self.ent_pos[chave] = (ex, ey)

        acoes = ctk.CTkFrame(rolagem, fg_color="transparent")
        acoes.pack(fill="x", padx=32, pady=12)
        botao(acoes, "Capturar todos em sequência", lambda: self.capturar([k for k, _, _ in CAMPOS]), "primario").pack(side="left")
        botao(acoes, "Salvar calibragem", self.salvar_posicoes, "normal").pack(side="left", padx=8)

        rotulo(rolagem, "Lista de veículos", 16, "bold", anchor="w").pack(fill="x", padx=32, pady=(18, 0))
        rotulo(rolagem, "Área da tela (a partir do campo Veículo) que o programa fotografa para achar o carro mais recente.",
               12, cor=MUTED, anchor="w").pack(fill="x", padx=32, pady=(2, 10))
        c2 = cartao(rolagem)
        c2.pack(fill="x", padx=32)
        l2 = ctk.CTkFrame(c2, fg_color="transparent")
        l2.pack(fill="x", padx=18, pady=16)
        self.ent_rec = {}
        for chave, nome in (("esquerda", "Esquerda"), ("acima", "Abaixo do campo"), ("largura", "Largura"), ("altura", "Altura")):
            col = ctk.CTkFrame(l2, fg_color="transparent")
            col.pack(side="left", padx=(0, 12))
            rotulo(col, nome, 11, cor=FAINT, anchor="w").pack(fill="x")
            e = entrada(col, width=96, justify="center")
            e.insert(0, str(self.config_.ajustes["recorte"][chave]))
            e.pack()
            e.bind("<FocusOut>", lambda _e: self.salvar_posicoes(silencioso=True))
            self.ent_rec[chave] = e
        botao(l2, "Ver recorte (5 s)", self.ver_recorte, "normal").pack(side="right")
        rotulo(rolagem, "Dica do “Ver recorte”: clique no campo Veículo, digite uma placa e espere a lista aparecer. "
               "Em 5 segundos o programa mostra a área que ele enxerga — a lista inteira precisa aparecer na imagem.",
               12, cor=FAINT, anchor="w", justify="left", wraplength=720).pack(fill="x", padx=32, pady=(8, 24))

    def salvar_posicoes(self, silencioso=False):
        try:
            for chave, (ex, ey) in self.ent_pos.items():
                self.config_.ajustes["posicoes"][chave] = [int(float(ex.get())), int(float(ey.get()))]
            for chave, e in self.ent_rec.items():
                self.config_.ajustes["recorte"][chave] = int(float(e.get()))
        except ValueError:
            self.cal_aviso.configure(text="Use só números nas posições.", text_color=DANGER)
            return
        self.config_.salvar()
        if not silencioso:
            self.cal_aviso.configure(text="✔ Calibragem salva.", text_color=OK)

    def capturar(self, chaves):
        if not keyboard:
            self.cal_aviso.configure(text="A captura com F9 só funciona no Windows.", text_color=DANGER)
            return
        if self.calibrando.is_set():
            return
        self.calibrando.set()
        nomes = {k: n for k, n, _ in CAMPOS}

        def tarefa():
            try:
                for k in chaves:
                    self.eventos.put(("cal_msg", {"msg": f"→ Coloque o mouse sobre: {nomes[k]}  e aperte F9   (Esc cancela)", "cor": ACCENT}))
                    tecla = keyboard.read_hotkey(suppress=False)
                    while tecla not in ("f9", "esc"):
                        tecla = keyboard.read_hotkey(suppress=False)
                    if tecla == "esc":
                        self.eventos.put(("cal_msg", {"msg": "Captura cancelada.", "cor": MUTED}))
                        return
                    x, y = pyautogui.position()
                    self.eventos.put(("cal_pos", {"chave": k, "x": x, "y": y}))
                    time.sleep(0.3)
                self.eventos.put(("cal_msg", {"msg": "✔ Posições capturadas e salvas.", "cor": OK}))
            finally:
                self.calibrando.clear()
        threading.Thread(target=tarefa, daemon=True).start()

    def testar_posicao(self, chave):
        try:
            ex, ey = self.ent_pos[chave]
            pyautogui.moveTo(int(float(ex.get())), int(float(ey.get())), duration=0.5)
        except Exception as e:
            self.cal_aviso.configure(text=f"Não deu para testar: {e}", text_color=DANGER)

    def ver_recorte(self):
        self.salvar_posicoes(silencioso=True)
        self.calibrando.set()

        def contagem(n):
            if n > 0:
                self.cal_aviso.configure(text=f"Abra a lista de veículos… foto em {n}", text_color=ACCENT)
                self.after(1000, lambda: contagem(n - 1))
                return
            try:
                auto = Automacao(self.config_.ajustes, self.central)
                esq, topo, w, h = auto.recorte_regiao()
                img = pyautogui.screenshot(region=(esq, topo, w, h))
                self.cal_aviso.configure(text="", text_color=ACCENT)
                janela = ctk.CTkToplevel(self, fg_color=BG)
                janela.title("Área que o programa enxerga")
                janela.attributes("-topmost", True)
                foto = ctk.CTkImage(dark_image=img, light_image=img, size=(w, h))
                ctk.CTkLabel(janela, text="", image=foto).pack(padx=12, pady=12)
                rotulo(janela, "A lista inteira de veículos precisa aparecer aqui. Se estiver cortada, ajuste os números.",
                       12, cor=MUTED).pack(padx=12, pady=(0, 12))
            except Exception as e:
                self.cal_aviso.configure(text=f"Não deu: {e}", text_color=DANGER)
            finally:
                self.calibrando.clear()
        contagem(5)

    # ------------------------------------------------------------ página: ajustes
    def pag_ajustes(self, p):
        rolagem = ctk.CTkScrollableFrame(p, fg_color=BG, corner_radius=0)
        rolagem.pack(fill="both", expand=True)
        self.cabecalho(rolagem, "Ajustes", "Tempos e comportamento do lançamento neste computador.")
        a = self.config_.ajustes
        c = cartao(rolagem)
        c.pack(fill="x", padx=32)
        self.aj_vars = {}

        def deslizante(chave, titulo, dica, de, ate, passos, sufixo=" s"):
            linha = ctk.CTkFrame(c, fg_color="transparent")
            linha.pack(fill="x", padx=18, pady=10)
            topo = ctk.CTkFrame(linha, fg_color="transparent")
            topo.pack(fill="x")
            rotulo(topo, titulo, 14, "bold", anchor="w").pack(side="left")
            valor = rotulo(topo, "", 14, "bold", cor=ACCENT)
            valor.pack(side="right")
            rotulo(linha, dica, 12, cor=FAINT, anchor="w").pack(fill="x")
            var = ctk.DoubleVar(value=float(a[chave]))
            s = ctk.CTkSlider(linha, from_=de, to=ate, number_of_steps=passos, variable=var,
                              button_color=ACCENT, button_hover_color=ACCENT_HOVER, progress_color=ACCENT, fg_color=BORDER,
                              command=lambda v: valor.configure(text=f"{v:.1f}{sufixo}"))
            s.pack(fill="x", pady=(8, 0))
            valor.configure(text=f"{var.get():.1f}{sufixo}")
            self.aj_vars[chave] = var

        deslizante("espera_lista", "Espera da lista de veículos", "Tempo depois de digitar a placa até a lista aparecer no site.", 0.5, 6, 11)
        deslizante("pausa_passos", "Pausa entre os passos", "Aumente se o site estiver lento e algum campo ficar vazio.", 0.1, 1.5, 14)
        deslizante("espera_entre_notas", "Espera entre uma nota e outra", "Tempo para o site salvar e limpar o formulário.", 1, 10, 18)

        c0 = cartao(rolagem)
        c0.pack(fill="x", padx=32, pady=(0, 12))
        linha0 = ctk.CTkFrame(c0, fg_color="transparent")
        linha0.pack(fill="x", padx=18, pady=(16, 4))
        rotulo(linha0, "Como lançar no sistema:", 14, "bold", anchor="w").pack(side="left")
        self.seg_modo = ctk.CTkSegmentedButton(linha0, values=["Navegador", "Mouse e teclado"], selected_color=ACCENT,
                                               selected_hover_color=ACCENT_HOVER, unselected_color=SURFACE_2,
                                               text_color=TEXT, font=fonte(13, "bold"))
        self.seg_modo.set("Navegador" if a.get("modo") == "navegador" else "Mouse e teclado")
        self.seg_modo.pack(side="left", padx=12)
        rotulo(c0, "Navegador: o programa abre uma janela própria do Chrome e preenche pelo código da página, sem calibragem "
                   "e sem usar o seu mouse. Faça login no Autos 360 nessa janela uma vez e deixe a tela "
                   "\"Nova Receita e Despesa de Veículo\" aberta nela.\nMouse e teclado: o jeito antigo, pelas posições da Calibragem.",
               12, cor=FAINT, anchor="w", justify="left", wraplength=640).pack(fill="x", padx=18, pady=(4, 8))
        botao(c0, "Usar o navegador e abrir agora", self.usar_navegador, "primario").pack(anchor="w", padx=18, pady=(0, 16))

        c2 = cartao(rolagem)
        c2.pack(fill="x", padx=32, pady=12)
        self.sw_salvar = ctk.BooleanVar(value=bool(a["salvar_automatico"]))
        ctk.CTkSwitch(c2, text="Clicar em Salvar sozinho (só quando o veículo for encontrado)", variable=self.sw_salvar,
                      font=fonte(14), text_color=TEXT, progress_color=ACCENT).pack(anchor="w", padx=18, pady=(16, 8))
        linha = ctk.CTkFrame(c2, fg_color="transparent")
        linha.pack(fill="x", padx=18, pady=(4, 8))
        rotulo(linha, "Como escolher o veículo na lista:", 14, anchor="w").pack(side="left")
        self.seg_sel = ctk.CTkSegmentedButton(linha, values=["Clique", "Teclado"], selected_color=ACCENT,
                                              selected_hover_color=ACCENT_HOVER, unselected_color=SURFACE_2,
                                              text_color=TEXT, font=fonte(13, "bold"))
        self.seg_sel.set("Teclado" if a.get("selecao_veiculo") == "teclado" else "Clique")
        self.seg_sel.pack(side="left", padx=12)
        self.sw_windows = ctk.BooleanVar(value=self._inicia_com_windows())
        ctk.CTkSwitch(c2, text="Abrir junto com o Windows", variable=self.sw_windows,
                      font=fonte(14), text_color=TEXT, progress_color=ACCENT).pack(anchor="w", padx=18, pady=(8, 16))

        c3 = cartao(rolagem)
        c3.pack(fill="x", padx=32, pady=(0, 12))
        rotulo(c3, "Consultas de veículo (Detran e IPVA)", 14, "bold", anchor="w").pack(fill="x", padx=18, pady=(16, 2))
        rotulo(c3, "O jeito recomendado é a extensão \"Lançador · Consultas\" no seu Chrome normal (o login do gov.br "
                   "não funciona na janela controlada pelo programa). Ligue a opção abaixo só se quiser que ESTE programa "
                   "faça as consultas.", 12, cor=WARN, anchor="w", justify="left", wraplength=640).pack(fill="x", padx=18, pady=(0, 6))
        self.sw_consultas_prog = ctk.BooleanVar(value=bool(a.get("consultas_no_programa")))
        ctk.CTkSwitch(c3, text="Fazer as consultas por este programa (em vez da extensão)", variable=self.sw_consultas_prog,
                      font=fonte(14), text_color=TEXT, progress_color=ACCENT).pack(anchor="w", padx=18, pady=(0, 8))
        rotulo(c3, "Na janela do Lançador, faça login no Detran e no IPVA (gov.br). Depois as consultas que chegam do "
                   "celular são feitas sozinhas e salvas em PDF nesta pasta.", 12, cor=FAINT, anchor="w", justify="left",
               wraplength=640).pack(fill="x", padx=18)
        lp = ctk.CTkFrame(c3, fg_color="transparent")
        lp.pack(fill="x", padx=18, pady=(10, 4))
        self.ent_pasta = entrada(lp)
        self.ent_pasta.insert(0, a.get("pasta_consultas") or os.path.join(os.path.expanduser("~"), "Documents", "Consultas Lançador"))
        self.ent_pasta.pack(side="left", fill="x", expand=True)
        botao(lp, "Escolher…", self.escolher_pasta, "normal").pack(side="left", padx=(8, 0))
        botao(lp, "Abrir pasta", self.abrir_pasta_consultas, "fantasma").pack(side="left", padx=(8, 0))
        c = c3
        deslizante("intervalo_consultas", "Intervalo entre consultas", "Pausa entre um veículo e outro (para o site não desconectar tão rápido).", 1, 15, 14)
        deslizante("espera_resultado", "Espera do resultado", "Tempo máximo esperando o site mostrar o resultado.", 15, 90, 15)
        self.sw_imprimir = ctk.BooleanVar(value=bool(a.get("imprimir_consultas")))
        ctk.CTkSwitch(c3, text="Imprimir automaticamente na impressora padrão (reabre o navegador)", variable=self.sw_imprimir,
                      font=fonte(14), text_color=TEXT, progress_color=ACCENT).pack(anchor="w", padx=18, pady=(8, 16))

        acoes = ctk.CTkFrame(rolagem, fg_color="transparent")
        acoes.pack(fill="x", padx=32)
        botao(acoes, "Salvar ajustes", self.salvar_ajustes, "primario").pack(side="left")
        botao(acoes, "Voltar ao padrão", self.ajustes_padrao, "fantasma").pack(side="left", padx=8)
        self.aj_aviso = rotulo(acoes, "", 13, "bold", cor=OK)
        self.aj_aviso.pack(side="left", padx=8)

        rotulo(rolagem, f"Central: {self.central.endereco}\nArquivos deste PC: {PASTA_DADOS}", 12, cor=FAINT,
               anchor="w", justify="left").pack(fill="x", padx=32, pady=(24, 24))

    def escolher_pasta(self):
        from tkinter import filedialog
        pasta = filedialog.askdirectory(initialdir=self.ent_pasta.get() or os.path.expanduser("~"),
                                        title="Pasta dos PDFs das consultas")
        if pasta:
            self.ent_pasta.delete(0, "end")
            self.ent_pasta.insert(0, os.path.normpath(pasta))

    def abrir_pasta_consultas(self):
        pasta = self.ent_pasta.get().strip()
        try:
            os.makedirs(pasta, exist_ok=True)
            if sys.platform.startswith("win"):
                os.startfile(pasta)
        except OSError as e:
            self.aj_aviso.configure(text=f"Não consegui abrir: {e}", text_color=DANGER)

    def usar_navegador(self):
        """Liga o modo navegador (salvando) e abre a janela."""
        self.seg_modo.set("Navegador")
        self.salvar_ajustes()
        self.pedido_navegador.set()

    def salvar_ajustes(self):
        a = self.config_.ajustes
        for k, var in self.aj_vars.items():
            a[k] = round(float(var.get()), 2)
        a["salvar_automatico"] = bool(self.sw_salvar.get())
        a["selecao_veiculo"] = "teclado" if self.seg_sel.get() == "Teclado" else "clique"
        modo_antes = a.get("modo")
        a["modo"] = "navegador" if self.seg_modo.get() == "Navegador" else "mouse"
        a["pasta_consultas"] = self.ent_pasta.get().strip()
        consultas_antes = bool(a.get("consultas_no_programa"))
        a["consultas_no_programa"] = bool(self.sw_consultas_prog.get())
        imprimir_antes = bool(a.get("imprimir_consultas"))
        a["imprimir_consultas"] = bool(self.sw_imprimir.get())
        if a["imprimir_consultas"] != imprimir_antes:
            self.reabrir_navegador.set()
        self.config_.salvar()
        self._definir_inicio_windows(bool(self.sw_windows.get()))
        self.aj_aviso.configure(text="✔ Salvo", text_color=OK)
        self.after(2500, lambda: self.aj_aviso.configure(text="") if self.aj_aviso.winfo_exists() else None)
        if a["modo"] != modo_antes or a["consultas_no_programa"] != consultas_antes:
            if a["modo"] == "navegador":
                self.pedido_navegador.set()
            self.montar_principal()
            self.ir("ajustes")

    def ajustes_padrao(self):
        for k in ("espera_lista", "pausa_passos", "espera_entre_notas"):
            self.aj_vars[k].set(PADRAO[k])
        self.sw_salvar.set(PADRAO["salvar_automatico"])
        self.seg_sel.set("Clique")
        self.seg_modo.set("Navegador" if self.config_.ajustes.get("modo") == "navegador" else "Mouse e teclado")
        self.salvar_ajustes()
        self.montar_principal()
        self.ir("ajustes")

    def _inicia_com_windows(self):
        if not sys.platform.startswith("win"):
            return False
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run") as k:
                winreg.QueryValueEx(k, "LancadorNotas")
                return True
        except OSError:
            return False

    def _definir_inicio_windows(self, ligar):
        if not sys.platform.startswith("win"):
            return
        import winreg
        caminho = f'"{sys.executable}"' if getattr(sys, "frozen", False) else f'"{sys.executable}" "{os.path.abspath(__file__)}"'
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE) as k:
            if ligar:
                winreg.SetValueEx(k, "LancadorNotas", 0, winreg.REG_SZ, caminho)
            else:
                try:
                    winreg.DeleteValue(k, "LancadorNotas")
                except OSError:
                    pass

    # ------------------------------------------------------------ página: histórico
    def pag_historico(self, p):
        topo = ctk.CTkFrame(p, fg_color="transparent")
        topo.pack(fill="x")
        self.cabecalho(topo, "Histórico", "As suas últimas notas, do celular até o sistema.")
        botao(topo, "Atualizar", self.carregar_historico, "normal", width=110).place(relx=1.0, x=-32, y=34, anchor="ne")
        self.lista_hist = ctk.CTkScrollableFrame(p, fg_color=SURFACE, corner_radius=14, border_width=1, border_color=BORDER)
        self.lista_hist.pack(fill="both", expand=True, padx=32, pady=(0, 24))

    def carregar_historico(self):
        if not self.central:
            return

        def tarefa():
            try:
                self.eventos.put(("historico", {"notas": self.central.historico()}))
            except Exception as e:
                self.eventos.put(("log", {"msg": f"Histórico indisponível: {e}"}))
        threading.Thread(target=tarefa, daemon=True).start()

    def mostrar_historico(self, notas):
        for w in self.lista_hist.winfo_children():
            w.destroy()
        if not notas:
            rotulo(self.lista_hist, "Nenhuma nota ainda.", 13, cor=FAINT).pack(pady=30)
            return
        for n in notas:
            linha = ctk.CTkFrame(self.lista_hist, fg_color="transparent")
            linha.pack(fill="x", padx=8, pady=6)
            ctk.CTkLabel(linha, text=n.get("placa") or "—", width=96, height=26, corner_radius=6, fg_color=SURFACE_2,
                         font=ctk.CTkFont(family="Consolas" if FONTE == "Segoe UI" else "Courier", size=13, weight="bold"),
                         text_color=TEXT).pack(side="left")
            cor = STATUS_COR.get(n["status"], MUTED)
            rotulo(linha, STATUS_TXT.get(n["status"], n["status"]), 12, "bold", cor=cor, width=80).pack(side="left", padx=10)
            textos = ctk.CTkFrame(linha, fg_color="transparent")
            textos.pack(side="left", fill="x", expand=True)
            rotulo(textos, n["descricao"][:95], 13, anchor="w").pack(fill="x")
            extra = quando(n.get("criado_em"))
            if n.get("mensagem"):
                extra += "  ·  " + n["mensagem"]
            rotulo(textos, extra, 11, cor=FAINT, anchor="w").pack(fill="x")
            rotulo(linha, f"R$ {n['valor']}", 13, "bold").pack(side="right", padx=8)

    # ------------------------------------------------------------ eventos vindos das threads
    def _bombear_eventos(self):
        try:
            while True:
                tipo, d = self.eventos.get_nowait()
                self._evento(tipo, d)
        except queue.Empty:
            pass
        self.after(150, self._bombear_eventos)

    def _evento(self, tipo, d):
        if tipo == "logado":
            self.logado(d["central"], d.get("usuario"))
        elif tipo == "login_falhou":
            self.tela_login(d["msg"])
        elif tipo == "login_erro":
            m = getattr(self, "mascote_login", None)
            if m and m.label.winfo_exists():
                m.definir("erro")
                self.after(2600, lambda: m.label.winfo_exists() and m.definir("acenando"))
            b, msg = d["widgets"]
            if b.winfo_exists():
                b.configure(state="normal", text="Entrar")
                msg.configure(text=d["msg"])
        elif tipo == "log":
            self.log(d["msg"])
        elif tipo == "lancando":
            self.ocupado = True
            n = d["nota"]
            dica = "pela janela do navegador" if self.config_.ajustes.get("modo") == "navegador" else "não mexa no mouse e no teclado"
            self.status(f"Lançando {n['placa']}…", f"R$ {n['valor']} · {dica}", WARN)
        elif tipo == "aguardando":
            self.status("Esperando você", d["motivo"], WARN)
            self.b_pular.pack(side="right", padx=(8, 0))
            self.deiconify()
        elif tipo == "lancada":
            if getattr(self, "st_mascote", None):
                self.st_mascote.definir("feliz", temporario=True)
            self.atualizar_numeros_rapido()
        elif tipo == "pronto":
            self.ocupado = False
            self.b_pular.pack_forget()
            if not self.pausado.is_set():
                self.status("Pronto", "Aguardando notas do celular…", OK)
        elif tipo == "pausado":
            self.ocupado = False
            self.b_pular.pack_forget()
            self.b_pausar.configure(text="Retomar")
            self.status("Pausado", "Você interrompeu o lançamento. Clique em Retomar para continuar.", WARN)
        elif tipo == "conexao":
            if not d["ok"]:
                self.status("Sem conexão", d.get("msg", "Tentando reconectar…"), DANGER)
                self._sem_conexao = True
            elif getattr(self, "_sem_conexao", False):
                self._sem_conexao = False
                if not self.pausado.is_set():
                    self.status("Pronto", "Conexão restabelecida. Aguardando notas…", OK)
        elif tipo == "numeros":
            total = sum(numero_br(n["valor"]) for n in d["lanc"])
            self.n_lancadas.configure(text=str(len(d["lanc"])))
            self.n_total.configure(text=moeda(total))
            self.n_fila.configure(text=str(len(d["fila"])))
            if d.get("cs_fila") is not None:
                self._cs_fila, self._cs_prontas = d["cs_fila"], d["cs_prontas"]
                self.mostrar_consultas()
        elif tipo == "historico":
            self.mostrar_historico(d["notas"])
        elif tipo == "consultando":
            c = d["consulta"]
            self.b_pular_consulta.pack(side="right", padx=(8, 0))
            self.mostrar_consultas(f"Consultando {c['placa']}…", WARN)
        elif tipo == "consulta_fim":
            if getattr(self, "b_pular_consulta", None) and self.b_pular_consulta.winfo_exists():
                self.b_pular_consulta.pack_forget()
            self.mostrar_consultas()
            self.atualizar_numeros_rapido()
        elif tipo == "consultas_pausadas":
            self.b_pausar_consultas.configure(text="Retomar consultas")
            self.b_pular_consulta.pack_forget()
            self.mostrar_consultas()
        elif tipo == "login_consulta":
            self._cs_logins.update(d["sites"])
            self.mostrar_consultas()
            self.deiconify()
            try:
                if sys.platform.startswith("win"):
                    import winsound
                    winsound.MessageBeep(winsound.MB_ICONEXCLAMATION)
                else:
                    self.bell()
            except Exception:
                pass
        elif tipo == "login_ok":
            self._cs_logins.discard(d["site"])
            self.mostrar_consultas()
        elif tipo == "versao":
            self.info_versao = d["info"]
            if d["info"].get("obrigatoria"):
                self.bloqueio_atualizacao.set()
                self.status("Atualização obrigatória", "Clique em Atualizar para continuar lançando.", WARN)
            self.mostrar_faixa_versao()
        elif tipo == "atual_progresso":
            if getattr(self, "faixa_botao", None) and self.faixa_botao.winfo_exists():
                self.faixa_botao.configure(text=d["texto"])
        elif tipo == "atual_erro":
            self.baixando_versao = False
            if not (self.info_versao or {}).get("obrigatoria"):
                self.bloqueio_atualizacao.clear()
            self.log(f"✖ Atualização: {d['msg']}")
            self.mostrar_faixa_versao(erro=d["msg"])
        elif tipo == "atual_baixado":
            self._esperar_e_aplicar(d["arquivo"])
        elif tipo == "cal_msg":
            self.cal_aviso.configure(text=d["msg"], text_color=d["cor"])
        elif tipo == "cal_pos":
            ex, ey = self.ent_pos[d["chave"]]
            ex.delete(0, "end"); ex.insert(0, str(d["x"]))
            ey.delete(0, "end"); ey.insert(0, str(d["y"]))
            self.salvar_posicoes(silencioso=True)

    def atualizar_numeros_rapido(self):
        def tarefa():
            try:
                inicio = datetime.now().astimezone().replace(hour=0, minute=0, second=0, microsecond=0)
                lanc = self.central.contar("lancada", inicio.astimezone(timezone.utc).isoformat())
                fila = self.central.contar("pendente")
                extra = {}
                try:
                    extra["cs_fila"] = len(self.central.contar_consultas("pendente")) + len(self.central.contar_consultas("consultando"))
                    extra["cs_prontas"] = len(self.central.contar_consultas("pronta", inicio.astimezone(timezone.utc).isoformat()))
                except Exception:
                    pass
                self.eventos.put(("numeros", {"lanc": lanc, "fila": fila, **extra}))
            except Exception:
                pass
        threading.Thread(target=tarefa, daemon=True).start()

    # ------------------------------------------------------------ atualização automática
    def _verificar_versao_loop(self):
        while not self.encerrando.is_set():
            try:
                info = atualizador.verificar(VERSAO)
                if info and info.get("versao") != (self.info_versao or {}).get("versao"):
                    registrar(f"Nova versão disponível: {info.get('versao')}")
                    self.eventos.put(("versao", {"info": info}))
            except Exception as e:
                registrar(f"Não consegui verificar atualizações: {e}")
            self.encerrando.wait(3600)

    def mostrar_faixa_versao(self, erro=""):
        area = getattr(self, "area_faixa", None)
        if not area or not area.winfo_exists():
            return
        for w in area.winfo_children():
            w.destroy()
        info = self.info_versao
        if not info:
            return
        c = ctk.CTkFrame(area, fg_color=SURFACE_2, border_color=ACCENT, border_width=1, corner_radius=14)
        c.pack(fill="x", pady=(0, 12))
        linha = ctk.CTkFrame(c, fg_color="transparent")
        linha.pack(fill="x", padx=18, pady=12)
        textos = ctk.CTkFrame(linha, fg_color="transparent")
        textos.pack(side="left", fill="x", expand=True)
        titulo = f"Nova versão {info['versao']} disponível" + (" · obrigatória" if info.get("obrigatoria") else "")
        rotulo(textos, titulo, 15, "bold", cor=ACCENT, anchor="w").pack(fill="x")
        sub = erro or info.get("novidades") or f"Você está na versão {VERSAO}."
        rotulo(textos, sub, 12, cor=DANGER if erro else MUTED, anchor="w", justify="left", wraplength=560).pack(fill="x")
        self.faixa_botao = botao(linha, "Baixando…" if self.baixando_versao else "Atualizar",
                                 self.iniciar_atualizacao, "primario", width=140)
        self.faixa_botao.pack(side="right")

    def iniciar_atualizacao(self):
        if self.baixando_versao or not self.info_versao:
            return
        if not getattr(sys, "frozen", False):
            self.mostrar_faixa_versao(erro="A atualização automática só funciona no LancadorNotas.exe.")
            return
        self.baixando_versao = True
        self.bloqueio_atualizacao.set()
        info = self.info_versao
        self.log(f"Baixando a versão {info['versao']}…")
        self.mostrar_faixa_versao()

        def progresso(feito, total):
            txt = f"Baixando {feito * 100 // total}%" if total else f"Baixando {feito // 1048576} MB"
            if txt != getattr(self, "_ult_prog", ""):
                self._ult_prog = txt
                self.eventos.put(("atual_progresso", {"texto": txt}))

        def tarefa():
            try:
                arq = atualizador.baixar(info, os.path.join(PASTA_DADOS, "atualizacao"), progresso,
                                         cancelar=self.encerrando)
                registrar(f"Versão {info['versao']} baixada e conferida: {arq}")
                self.eventos.put(("atual_baixado", {"arquivo": arq}))
            except Exception as e:
                registrar(traceback.format_exc())
                self.eventos.put(("atual_erro", {"msg": str(e)}))
        threading.Thread(target=tarefa, daemon=True).start()

    def _esperar_e_aplicar(self, arquivo):
        """Espera a nota em andamento terminar, dispara a troca do arquivo e fecha."""
        t = self.trabalhador
        if t and t.em_tarefa:
            if getattr(self, "faixa_botao", None) and self.faixa_botao.winfo_exists():
                self.faixa_botao.configure(text="Terminando a nota…")
            self.after(500, lambda: self._esperar_e_aplicar(arquivo))
            return
        try:
            atualizador.aplicar(arquivo, PASTA_DADOS)
        except Exception as e:
            registrar(traceback.format_exc())
            self.eventos.put(("atual_erro", {"msg": f"Não consegui iniciar a troca do arquivo: {e}"}))
            return
        registrar(f"Atualizando de {VERSAO} para {self.info_versao.get('versao')}: fechando para trocar o arquivo.")
        self.encerrando.set()
        try:
            self.config_.salvar()
        except OSError:
            pass
        self._fechar_para_atualizar(0)

    def _fechar_para_atualizar(self, tentativas):
        """Espera o Trabalhador fechar o navegador (até ~8 s) e sai de vez, para o .bat poder trocar o arquivo."""
        t = self.trabalhador
        if t and t.is_alive() and tentativas < 16:
            self.after(500, lambda: self._fechar_para_atualizar(tentativas + 1))
            return
        try:
            self.destroy()
        finally:
            os._exit(0)

    def fechar(self):
        if self.ocupado:
            from tkinter import messagebox
            if not messagebox.askyesno("Lançador de Notas", "Uma nota está sendo lançada agora. Fechar mesmo assim?"):
                return
            if self.automacao:
                self.automacao.parar.set()
        self.encerrando.set()
        try:
            self.config_.salvar()
        except OSError:
            pass
        self.destroy()


def instancia_unica():
    """Impede abrir o programa duas vezes no mesmo PC."""
    for _ in range(20):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.bind(("127.0.0.1", 47613))
            return s
        except OSError:
            s.close()
            time.sleep(0.5)
    return None


if __name__ == "__main__":
    trava = instancia_unica()
    if trava is None:
        abertura.fechar()
        import tkinter
        from tkinter import messagebox
        r = tkinter.Tk()
        r.withdraw()
        messagebox.showinfo("Lançador de Notas", "O programa já está aberto (veja na barra de tarefas).")
        sys.exit(0)
    abertura.fase("Abrindo a janela…")
    try:
        App().mainloop()
    except Exception:
        abertura.fechar()
        registrar(traceback.format_exc())
        raise
