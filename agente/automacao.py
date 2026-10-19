"""Preenche o formulário do sistema usando mouse e teclado."""
import base64
import io
import sys
import threading
import time

import pyautogui
import pyperclip

pyautogui.FAILSAFE = True   # mouse no canto superior esquerdo = parar
pyautogui.PAUSE = 0.02

CAMPOS = [
    ("veiculo", "Veículo", "O campo de busca do veículo"),
    ("descricao", "Descrição", "O campo de descrição"),
    ("valor", "Valor", "O campo de valor (onde fica o 0,00)"),
    ("salvar", "Botão Salvar", "O botão roxo Salvar"),
]

PADRAO = {
    "posicoes": {
        "veiculo": [1438, 548],
        "descricao": [1453, 738],
        "valor": [1482, 821],
        "salvar": [1481, 874],
    },
    "espera_lista": 2.0,
    "pausa_passos": 0.3,
    "espera_entre_notas": 3.0,
    "salvar_automatico": True,
    "selecao_veiculo": "clique",
    "modo": "mouse",            # "mouse" (posições na tela) ou "navegador" (pelo código da página)
    "url_formulario": "",       # tela "Nova Receita e Despesa de Veículo" (guardada sozinha no modo navegador)
    # consultas de veículo (Detran / IPVA)
    "pasta_consultas": "",      # vazio = Documentos\Consultas Lançador
    "intervalo_consultas": 3.0,
    "espera_resultado": 40.0,
    "imprimir_consultas": False,
    "consultas_no_programa": False,  # padrão: as consultas são feitas pela extensão do Chrome (o gov.br recusa a janela controlada)
    "recorte": {"esquerda": -200, "acima": 15, "largura": 750, "altura": 400},
}


class Parado(Exception):
    """Lançamento interrompido pelo usuário (F10 ou mouse no canto)."""


class Automacao:
    def __init__(self, ajustes: dict, central, log=print):
        self.a = ajustes
        self.central = central
        self.log = log
        self.parar = threading.Event()

    # ------------------------------------------------------------ utilidades
    def _checar(self):
        if self.parar.is_set():
            raise Parado()

    def _dormir(self, seg):
        fim = time.time() + seg
        while time.time() < fim:
            self._checar()
            time.sleep(0.05)

    def _clicar(self, campo):
        self._checar()
        x, y = self.a["posicoes"][campo]
        pyautogui.click(int(x), int(y))
        self._dormir(self.a["pausa_passos"])

    def _colar(self, texto):
        self._checar()
        pyperclip.copy(texto)
        pyautogui.hotkey("ctrl", "a")
        pyautogui.hotkey("ctrl", "v")
        self._dormir(self.a["pausa_passos"])

    def recorte_regiao(self):
        vx, vy = self.a["posicoes"]["veiculo"]
        r = self.a["recorte"]
        tela_w, tela_h = pyautogui.size()
        esq = max(0, int(vx) + int(r["esquerda"]))
        topo = max(0, int(vy) + int(r["acima"]))
        w = max(50, min(int(r["largura"]), tela_w - esq))
        h = max(50, min(int(r["altura"]), tela_h - topo))
        return esq, topo, w, h

    # ------------------------------------------------------------ veículo
    def _selecionar_veiculo(self, placa) -> str:
        """Escolhe na lista a opção com a data mais recente. Devolve o texto escolhido ('' se não achou)."""
        esq, topo, w, h = self.recorte_regiao()
        img = pyautogui.screenshot(region=(esq, topo, w, h))
        buf = io.BytesIO()
        img.save(buf, "PNG")
        d = self.central.escolher_veiculo(base64.b64encode(buf.getvalue()).decode(), placa, w, h)
        self._checar()
        if not d.get("quantidade"):
            return ""
        if d["quantidade"] > 1:
            self.log(f"   {d['quantidade']} veículos na lista, escolhido o mais recente (nº {d['escolhida']}).")
        if self.a.get("selecao_veiculo") == "teclado":
            pyautogui.press("down", presses=max(1, int(d["escolhida"])), interval=0.1)
            pyautogui.press("enter")
        else:
            vx = int(self.a["posicoes"]["veiculo"][0])
            pyautogui.click(vx, topo + int(d["y"]))
        self._dormir(self.a["pausa_passos"])
        return d.get("texto") or f"opção {d['escolhida']}"

    # ------------------------------------------------------------ lançamento
    def lancar(self, nota) -> dict:
        """Preenche o formulário. Devolve {'veiculo_ok', 'salvo', 'veiculo'}."""
        self.parar.clear()
        placa = (nota.get("placa") or "").upper()

        self._clicar("veiculo")
        self._colar(placa)
        self._dormir(float(self.a["espera_lista"]))
        veiculo = ""
        try:
            veiculo = self._selecionar_veiculo(placa) if placa else ""
        except Parado:
            raise
        except Exception as e:  # sem internet, erro na API...
            self.log(f"   Não consegui escolher o veículo: {e}")

        self._clicar("descricao")
        self._colar(nota["descricao"])
        self._clicar("valor")
        self._colar(nota["valor"])

        salvo = False
        if self.a.get("salvar_automatico") and veiculo:
            self._dormir(0.4)
            self._clicar("salvar")
            salvo = True
        return {"veiculo_ok": bool(veiculo), "salvo": salvo, "veiculo": veiculo}

    # ------------------------------------------------------------ esperar o clique em Salvar
    def esperar_salvar(self, pular: threading.Event, timeout=None) -> bool:
        """Espera a pessoa clicar em Salvar no site. True = clicou; False = pulou/parou."""
        if not sys.platform.startswith("win"):
            pular.wait(timeout)
            return False
        import ctypes
        botao = lambda: ctypes.windll.user32.GetAsyncKeyState(0x01) & 0x8000
        sx, sy = self.a["posicoes"]["salvar"]
        inicio = time.time()
        while not pular.is_set() and not self.parar.is_set():
            if timeout and time.time() - inicio > timeout:
                return False
            if botao():
                x, y = pyautogui.position()
                while botao():
                    time.sleep(0.02)
                if abs(x - sx) <= 260 and abs(y - sy) <= 28:
                    return True
            time.sleep(0.03)
        return False
