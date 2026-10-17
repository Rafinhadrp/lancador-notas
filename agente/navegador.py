"""Preenche o formulário do Autos 360 pelo código da página (Playwright), sem mouse e sem calibragem.

O programa abre uma janela própria do Chrome (ou do Edge) com um perfil guardado em
%APPDATA%\\LancadorNotas\\navegador. A pessoa faz login no Autos 360 nessa janela uma vez só
e deixa aberta a tela "Nova Receita e Despesa de Veículo".

Todas as chamadas do Playwright precisam acontecer na mesma thread (a do Trabalhador).
"""
import os
import re
import threading
import time

from automacao import Parado

SEL_VEICULO = 'input[name="veiculo"]'
SEL_DESCRICAO = 'input[name="descricao"], textarea[name="descricao"]'
SEL_VALOR = 'input[name="valor"]'
SEL_SALVAR = 'button[aria-label="Salvar"]'
SEL_OPCOES = ('.p-autocomplete-panel li[role="option"], .p-autocomplete-panel li.p-autocomplete-item, '
              '[role="listbox"] [role="option"]')
SEL_SEM_RESULTADO = '.p-autocomplete-empty-message'
SEL_TOAST_OK = '.p-toast-message-success'
SEL_TOAST_ERRO = '.p-toast-message-error'

# marca no sessionStorage quando alguém clica em Salvar (sobrevive a recarregar a página)
SCRIPT_CLIQUE = """
document.addEventListener('click', (e) => {
  if (e.target && e.target.closest && e.target.closest('button[aria-label="Salvar"]')) {
    try { sessionStorage.setItem('__lancador_salvou', String(Date.now())); } catch (_) {}
  }
}, true);
"""


class FormularioAusente(Exception):
    """A tela de lançamento não está aberta na janela do Lançador."""


def so_letras_numeros(s):
    return re.sub(r"[^A-Z0-9]", "", str(s or "").upper())


def numero_br(v):
    s = re.sub(r"[^\d,.-]", "", str(v or ""))
    if not s:
        return None
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def escolher_opcao(textos, placa):
    """Entre as opções da lista, a da placa buscada com a data mais recente. Devolve o índice ou None."""
    alvo = so_letras_numeros(placa)
    melhor, melhor_data = None, None
    for i, t in enumerate(textos):
        inicio = t.split(" - ")[0]
        if so_letras_numeros(inicio) != alvo:
            continue
        datas = re.findall(r"(?<!\d)(\d{2})/(\d{2})/(\d{4})(?!\d)", t)
        data = max(((int(a), int(m), int(d)) for d, m, a in datas), default=(0, 0, 0))
        if melhor is None or data > melhor_data:
            melhor, melhor_data = i, data
    return melhor


class Navegador:
    """Janela do navegador controlada pelo programa."""

    def __init__(self, pasta_dados, log=print, headless=False, executavel=None, imprimir_direto=False):
        self.pasta = os.path.join(pasta_dados, "navegador")
        self.imprimir_direto = imprimir_direto  # --kiosk-printing: window.print() vai direto para a impressora padrão
        self.abas_reservadas = set()  # abas das consultas (Detran/IPVA): o lançamento de notas não usa
        self.log = log
        self.headless = headless
        self.executavel = executavel
        self._pw = None
        self.contexto = None
        self._fechado = False

    def aberto(self):
        return bool(self.contexto) and not self._fechado

    def abrir(self, url=""):
        if self.aberto():
            self.pagina_formulario(url, esperar=0, trazer=True)
            return
        self.fechar()
        from playwright.sync_api import sync_playwright
        self._pw = sync_playwright().start()
        # Os sites do governo de SP seguram navegadores marcados como "automatizados" (o Rafael confirmou
        # que no Chrome normal abre). A janela abre como um Chrome comum: sem a marca --enable-automation
        # e sem navigator.webdriver. Login e captcha continuam sempre com a pessoa.
        args = ["--start-maximized", "--disable-blink-features=AutomationControlled"]
        args += ["--kiosk-printing"] if self.imprimir_direto else []
        opcoes = dict(user_data_dir=self.pasta, headless=self.headless, no_viewport=True,
                      args=args, locale="pt-BR", ignore_default_args=["--enable-automation"])
        erros = []
        canais = [None] if self.executavel else ["chrome", "msedge"]
        for canal in canais:
            try:
                if self.executavel:
                    self.contexto = self._pw.chromium.launch_persistent_context(executable_path=self.executavel, **opcoes)
                else:
                    self.contexto = self._pw.chromium.launch_persistent_context(channel=canal, **opcoes)
                break
            except Exception as e:
                erros.append(f"{canal}: {e}")
        if not self.contexto:
            self.fechar()
            raise RuntimeError("Não consegui abrir o Chrome nem o Edge. " + " | ".join(erros)[:300])
        self._fechado = False
        self.contexto.on("close", lambda *_: setattr(self, "_fechado", True))
        self.contexto.add_init_script(SCRIPT_CLIQUE)
        pagina = self.contexto.pages[0] if self.contexto.pages else self.contexto.new_page()
        if url:
            try:
                pagina.goto(url, wait_until="domcontentloaded", timeout=30000)
            except Exception as e:
                self.log(f"   Não consegui abrir {url}: {e}")
        self.log("Navegador do Lançador aberto. Faça login no Autos 360 nele e deixe a tela de lançamento aberta.")

    def fechar(self):
        try:
            if self.contexto:
                self.contexto.close()
        except Exception:
            pass
        try:
            if self._pw:
                self._pw.stop()
        except Exception:
            pass
        self.contexto = None
        self._pw = None
        self.abas_reservadas = set()

    def pagina_formulario(self, url="", esperar=8.0, trazer=False, checar=lambda: None):
        """Acha a aba com o formulário. Se não achar e houver URL guardada, abre ela."""
        def procurar():
            for pg in reversed(self.contexto.pages):
                if pg in self.abas_reservadas:
                    continue
                try:
                    if pg.locator(SEL_VEICULO).first.is_visible():
                        return pg
                except Exception:
                    pass
            return None

        pg = procurar()
        if pg is None and url:
            livres = [pg for pg in self.contexto.pages if pg not in self.abas_reservadas]
            alvo = livres[-1] if livres else self.contexto.new_page()
            try:
                alvo.goto(url, wait_until="domcontentloaded", timeout=30000)
            except Exception:
                pass
        fim = time.time() + esperar
        while pg is None and time.time() < fim:
            checar()
            time.sleep(0.3)
            pg = procurar()
        if pg is not None and trazer:
            try:
                pg.bring_to_front()
            except Exception:
                pass
        return pg


class AutomacaoNavegador:
    """Mesma interface da Automacao (mouse e teclado): lancar() e esperar_salvar()."""

    def __init__(self, ajustes: dict, navegador: Navegador, log=print):
        self.a = ajustes
        self.nav = navegador
        self.log = log
        self.parar = threading.Event()
        self.pagina = None
        self.fim_preenchimento_ms = 0

    def _checar(self):
        if self.parar.is_set():
            raise Parado()

    def _dormir(self, seg):
        fim = time.time() + seg
        while time.time() < fim:
            self._checar()
            time.sleep(0.05)

    def _formulario(self):
        url = self.a.get("url_formulario", "")
        pg = self.nav.pagina_formulario(url, esperar=8.0, checar=self._checar)
        if pg is None:
            raise FormularioAusente("Abra a tela \"Nova Receita e Despesa de Veículo\" na janela do Lançador.")
        # formulário ainda com dados de antes: recarrega para começar limpo
        if url and pg.locator(SEL_VEICULO).first.input_value().strip():
            pg.goto(url, wait_until="domcontentloaded", timeout=30000)
            pg.locator(SEL_VEICULO).first.wait_for(state="visible", timeout=15000)
        if pg.url and pg.url != self.a.get("url_formulario"):
            self.a["url_formulario"] = pg.url
        return pg

    # ------------------------------------------------------------ veículo
    def _veiculo(self, pg, placa) -> str:
        campo = pg.locator(SEL_VEICULO).first
        campo.click()
        campo.fill("")
        campo.press_sequentially(placa, delay=70)
        opcoes = pg.locator(SEL_OPCOES)
        limite = time.time() + max(4.0, float(self.a.get("espera_lista", 2.0)) * 3)
        textos = []
        while time.time() < limite:
            self._checar()
            if opcoes.count() and opcoes.first.is_visible():
                time.sleep(0.4)  # deixa a lista terminar de atualizar
                textos = [t.strip() for t in opcoes.all_inner_texts()]
                if escolher_opcao(textos, placa) is not None:
                    break
            elif pg.locator(SEL_SEM_RESULTADO).count() and pg.locator(SEL_SEM_RESULTADO).first.is_visible():
                break
            time.sleep(0.15)
        i = escolher_opcao(textos, placa)
        if i is None:
            if textos:
                self.log(f"   {len(textos)} opções na lista, nenhuma com a placa {placa}.")
            return ""
        if len(textos) > 1:
            self.log(f"   {len(textos)} veículos na lista, escolhido o mais recente.")
        opcoes.nth(i).click()
        self._dormir(0.3)
        return textos[i]

    def _valor(self, pg, valor):
        campo = pg.locator(SEL_VALOR).first
        esperado = numero_br(valor)
        # campo com máscara de moeda: digitar só os números (2231 -> 22,31)
        campo.click()
        campo.press("Control+a")
        campo.press("Backspace")
        campo.press_sequentially(f"{esperado:.2f}".replace(".", ""), delay=40)
        campo.press("Tab")
        if numero_br(campo.input_value()) == esperado:
            return
        campo.fill(valor)
        campo.press("Tab")
        lido = campo.input_value()
        if numero_br(lido) != esperado:
            raise RuntimeError(f"o campo Valor ficou \"{lido}\" em vez de {valor}")

    def _salvar(self, pg) -> bool:
        botao = pg.locator(SEL_SALVAR).first
        limite = time.time() + 10
        while not botao.is_enabled():
            self._checar()
            if time.time() > limite:
                self.log("   O botão Salvar continuou desligado.")
                return False
            time.sleep(0.2)
        ok_antes = pg.locator(SEL_TOAST_OK).count()
        botao.click()
        limite = time.time() + 12
        while time.time() < limite:
            self._checar()
            erro = pg.locator(SEL_TOAST_ERRO)
            if erro.count() and erro.first.is_visible():
                raise RuntimeError("o sistema recusou: " + erro.first.inner_text().strip().replace("\n", " ")[:200])
            if pg.locator(SEL_TOAST_OK).count() > ok_antes:
                return True
            try:
                if not pg.locator(SEL_VEICULO).first.is_visible() or not pg.locator(SEL_VEICULO).first.input_value().strip():
                    return True  # formulário fechou ou foi limpo
            except Exception:
                return True  # a página mudou depois de salvar
            time.sleep(0.2)
        self.log("   Cliquei em Salvar, mas o sistema não mostrou confirmação. Confira no Autos 360.")
        return True

    # ------------------------------------------------------------ lançamento
    def lancar(self, nota) -> dict:
        self.parar.clear()
        placa = so_letras_numeros(nota.get("placa"))
        pg = self.pagina = self._formulario()
        self._checar()
        veiculo = self._veiculo(pg, placa) if placa else ""
        self._checar()
        pg.locator(SEL_DESCRICAO).first.fill(str(nota["descricao"])[:500])
        self._checar()
        self._valor(pg, nota["valor"])
        self._checar()
        salvo = False
        if self.a.get("salvar_automatico") and veiculo:
            salvo = self._salvar(pg)
        self.fim_preenchimento_ms = int(time.time() * 1000)
        if not salvo:
            try:
                pg.bring_to_front()
            except Exception:
                pass
        return {"veiculo_ok": bool(veiculo), "salvo": salvo, "veiculo": veiculo}

    def esperar_salvar(self, pular: threading.Event, timeout=None) -> bool:
        """Espera a pessoa clicar em Salvar na janela do Lançador."""
        pg = self.pagina
        inicio_ms = self.fim_preenchimento_ms or int(time.time() * 1000)
        inicio = time.time()
        while not pular.is_set() and not self.parar.is_set():
            if timeout and time.time() - inicio > timeout:
                return False
            try:
                marca = pg.evaluate("() => sessionStorage.getItem('__lancador_salvou')")
                if marca and int(marca) >= inicio_ms:
                    time.sleep(1.0)
                    return True
            except Exception:
                pass  # página recarregando
            time.sleep(0.3)
        return False
