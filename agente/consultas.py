"""Consultas de veículo (débitos e restrições) no Detran-SP e no IPVA, na janela do navegador do Lançador.

A pessoa faz o login (gov.br + captcha) em cada site, uma vez. Depois o programa consulta sozinho:
abre a tela de consulta, preenche placa e Renavam, clica em Consultar, salva o resultado em PDF
(e imprime, se ligado) e passa para o próximo. Quando o site desconecta, pausa SÓ aquele site,
avisa e continua sozinho assim que a pessoa logar de novo.

O programa NUNCA tenta resolver captcha nem automatizar o login.

>>> SELETORES: tudo o que depende das páginas dos sites fica em SITES, logo abaixo. <<<
Enquanto não temos os elementos exatos (F12), são usados seletores "largos" (por nome, id,
placeholder e texto). Quando o Rafael mandar os elementos, é só trocar aqui.
"""
import base64
import io
import os
import re
import threading
import time
from datetime import datetime

from automacao import Parado

# Seletores: cada valor pode ser uma lista; o primeiro que aparecer visível é usado.
SITES = {
    "detran": {
        "nome": "Detran",
        "url": "https://www.detran.sp.gov.br/detransp/pb/servicos/veiculos/consultar_debitos_restricoes"
               "?id=consultar_debitos_restricoes",
        # antes de preencher: aba/botão "Consultar veículos de outras pessoas" (a conta é pessoal)
        "antes": ["text=/ve[ií]culos? de outras pessoas/i"],
        "placa": ['input[name*="placa" i]', 'input[id*="placa" i]', 'input[placeholder*="placa" i]',
                  'input[aria-label*="placa" i]'],
        "renavam": ['input[name*="renavam" i]', 'input[id*="renavam" i]', 'input[placeholder*="renavam" i]',
                    'input[aria-label*="renavam" i]'],
        "consultar": ['button:has-text("Consultar")', 'input[type="submit"][value*="onsultar"]',
                      'button:has-text("Pesquisar")', 'button[type="submit"]'],
        # área que só existe na página de resultado (vazio = descobre sozinho: formulário sumiu/URL mudou)
        "resultado": [],
        "erro": ['[role="alert"]', '.alert-danger', '.br-message.danger', '.br-message.warning',
                 '.mensagem-erro', '.text-danger', '.invalid-feedback', '.error-message'],
    },
    "ipva": {
        "nome": "IPVA",
        "url": "https://www3.fazenda.sp.gov.br/SIVEI/DebitosVinculados/Consulta",
        "antes": [],
        "placa": ['input[name*="placa" i]', 'input[id*="placa" i]', 'input[placeholder*="placa" i]',
                  'input[aria-label*="placa" i]'],
        "renavam": ['input[name*="renavam" i]', 'input[id*="renavam" i]', 'input[placeholder*="renavam" i]',
                    'input[aria-label*="renavam" i]'],
        "consultar": ['button:has-text("Consultar")', 'input[type="submit"][value*="onsultar"]',
                      'button:has-text("Pesquisar")', 'button[type="submit"]', 'input[type="submit"]'],
        "resultado": [],
        "erro": ['[role="alert"]', '.alert-danger', '.validation-summary-errors', '.field-validation-error',
                 '.text-danger', '.mensagem-erro', '.error-message'],
    },
}

# sinais de que o site pediu login de novo (sessão expirada)
SINAIS_LOGIN_URL = re.compile(r"acesso\.gov\.br|sso\.|/login|/Login|autenticacao|signin", re.I)
SINAIS_LOGIN_SEL = ['iframe[src*="recaptcha"]', 'iframe[src*="hcaptcha"]', '.g-recaptcha', '.h-captcha',
                    'input[type="password"]', 'text=/entrar com gov\\.br/i']

ORDEM = ("detran", "ipva")


class SessaoExpirada(Exception):
    """O site pediu login de novo."""


class ErroSite(Exception):
    """O site respondeu com erro (Renavam não confere, veículo não encontrado, fora do ar...)."""


def lista(v):
    return v if isinstance(v, (list, tuple)) else ([v] if v else [])


def nome_arquivo(pasta, placa, site, quando=None):
    quando = quando or datetime.now()
    base = os.path.join(pasta, f"{placa}_{SITES[site]['nome'].upper()}_{quando:%Y-%m-%d}")
    caminho, n = base + ".pdf", 2
    while os.path.exists(caminho):
        caminho, n = f"{base}_{n}.pdf", n + 1
    return caminho


class Consultor:
    """Faz as consultas. Todas as chamadas precisam vir da thread do Trabalhador (Playwright)."""

    def __init__(self, navegador, ajustes, log=print, sites=None):
        self.nav = navegador
        self.a = ajustes
        self.log = log
        self.sites = sites or SITES
        self.abas = {}                                   # site -> página fixa
        self.precisa_login = {s: False for s in ORDEM}   # site pausado esperando login
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

    def _visivel(self, pg, seletores):
        for sel in lista(seletores):
            try:
                loc = pg.locator(sel)
                n = min(loc.count(), 5)
                for i in range(n):
                    if loc.nth(i).is_visible():
                        return loc.nth(i)
            except Exception:
                pass
        return None

    def aba(self, site):
        pg = self.abas.get(site)
        if pg is None or pg.is_closed():
            pg = self.nav.contexto.new_page()
            self.abas[site] = pg
            self.nav.abas_reservadas.add(pg)
        return pg

    def pede_login(self, pg, cfg):
        try:
            if SINAIS_LOGIN_URL.search(pg.url or ""):
                return True
        except Exception:
            pass
        return self._visivel(pg, SINAIS_LOGIN_SEL) is not None and self._visivel(pg, cfg["placa"] + cfg["renavam"]) is None

    def formulario_pronto(self, site):
        """True se a tela de consulta (com o campo Renavam) está visível na aba do site."""
        cfg = self.sites[site]
        pg = self.aba(site)
        alvo = self._visivel(pg, cfg["renavam"]) or self._visivel(pg, cfg["placa"])
        if alvo is None and cfg.get("antes"):
            return self._visivel(pg, cfg["antes"]) is not None
        return alvo is not None

    def abrir_formulario(self, site, esperar=20.0):
        """Vai para a tela de consulta e deixa os campos prontos. Levanta SessaoExpirada se pedir login."""
        cfg = self.sites[site]
        pg = self.aba(site)
        try:
            pg.goto(cfg["url"], wait_until="domcontentloaded", timeout=45000)
        except Exception as e:
            if self.pede_login(pg, cfg):
                raise SessaoExpirada()
            raise ErroSite(f"o site não abriu ({e.__class__.__name__})")
        fim = time.time() + esperar
        clicou_antes = False
        while time.time() < fim:
            self._checar()
            if self._visivel(pg, cfg["renavam"]) is not None:
                return pg
            if cfg.get("antes") and not clicou_antes:
                botao = self._visivel(pg, cfg["antes"])
                if botao is not None:
                    botao.click()
                    clicou_antes = True
                    self._dormir(0.8)
                    continue
            if self.pede_login(pg, cfg):
                raise SessaoExpirada()
            time.sleep(0.3)
        if self.pede_login(pg, cfg):
            raise SessaoExpirada()
        raise SessaoExpirada("sem_formulario")  # tratar como desconectado; a pessoa confere a tela

    def _preencher(self, pg, seletores, valor):
        campo = self._visivel(pg, seletores)
        if campo is None:
            return False
        campo.click()
        campo.fill("")
        campo.press_sequentially(valor, delay=35)
        campo.press("Tab")
        return True

    def _texto_erro(self, pg, cfg):
        el = self._visivel(pg, cfg["erro"])
        if el is None:
            return ""
        try:
            t = re.sub(r"\s+", " ", el.inner_text()).strip()
        except Exception:
            return ""
        return t[:300]

    def _tamanho_texto(self, pg):
        try:
            return int(pg.evaluate("() => (document.body && document.body.innerText || '').length"))
        except Exception:
            return 0

    # ------------------------------------------------------------ resultado
    def _salvar_pdf(self, pg, caminho):
        os.makedirs(os.path.dirname(caminho), exist_ok=True)
        try:
            cdp = self.nav.contexto.new_cdp_session(pg)
            r = cdp.send("Page.printToPDF", {"printBackground": True, "preferCSSPageSize": True})
            with open(caminho, "wb") as f:
                f.write(base64.b64decode(r["data"]))
            return caminho
        except Exception:
            pass
        # navegador que não gera PDF: foto da página inteira dentro de um PDF
        from PIL import Image
        img = Image.open(io.BytesIO(pg.screenshot(full_page=True))).convert("RGB")
        img.save(caminho, "PDF", resolution=110.0)
        return caminho

    def _imprimir(self, pg):
        try:
            pg.evaluate("() => setTimeout(() => window.print(), 50)")
            self._dormir(2.5)
        except Exception as e:
            self.log(f"   Não consegui imprimir: {e}")

    def consultar_site(self, site, placa, renavam, pasta):
        """Faz a consulta num site. Devolve o caminho do PDF. Levanta SessaoExpirada / ErroSite."""
        cfg = self.sites[site]
        pg = self.abrir_formulario(site)
        url_form = pg.url
        if not self._preencher(pg, cfg["placa"], placa) and cfg["placa"]:
            self.log(f"   {cfg['nome']}: campo de placa não encontrado, seguindo só com o Renavam.")
        if not self._preencher(pg, cfg["renavam"], renavam):
            raise ErroSite("campo do Renavam não encontrado")
        self._checar()
        botao = self._visivel(pg, cfg["consultar"])
        if botao is None:
            raise ErroSite("botão Consultar não encontrado")
        erro_antes = self._texto_erro(pg, cfg)
        tam_antes = self._tamanho_texto(pg)
        inicio = time.time()
        botao.click()

        fim = time.time() + float(self.a.get("espera_resultado", 40))
        estavel_desde = None
        while time.time() < fim:
            self._checar()
            time.sleep(0.4)
            try:
                if self.pede_login(pg, cfg):
                    raise SessaoExpirada()
                erro = self._texto_erro(pg, cfg)
                if erro and erro != erro_antes:
                    raise ErroSite(erro)
                if cfg.get("resultado"):
                    if self._visivel(pg, cfg["resultado"]) is not None:
                        break
                    continue
                mudou = pg.url != url_form or self._visivel(pg, cfg["renavam"]) is None
                if mudou:
                    estavel_desde = estavel_desde or time.time()
                    if time.time() - estavel_desde > 1.5:
                        try:
                            pg.wait_for_load_state("networkidle", timeout=8000)
                        except Exception:
                            pass
                        break
                elif time.time() - inicio > 3 and self._tamanho_texto(pg) - tam_antes > 300:
                    # resultado na mesma página, abaixo do formulário
                    try:
                        pg.wait_for_load_state("networkidle", timeout=8000)
                    except Exception:
                        pass
                    self._dormir(1.0)
                    break
                else:
                    estavel_desde = None
            except (SessaoExpirada, ErroSite, Parado):
                raise
            except Exception:
                continue  # página no meio da navegação
        else:
            erro = self._texto_erro(pg, cfg)
            raise ErroSite(erro or "o site não mostrou o resultado a tempo")

        caminho = self._salvar_pdf(pg, nome_arquivo(pasta, placa, site))
        if self.a.get("imprimir_consultas"):
            self._imprimir(pg)
        return caminho

    # ------------------------------------------------------------ uma consulta inteira (os dois sites)
    def processar(self, consulta, sites_livres, pasta):
        """Consulta os sites que faltam. Devolve dict com o que mudou e se algum site pediu login."""
        r = {"detran_status": consulta.get("detran_status") or "", "ipva_status": consulta.get("ipva_status") or "",
             "arquivos": [a for a in (consulta.get("arquivos") or "").split("\n") if a], "mensagens": [],
             "login": []}
        for site in ORDEM:
            chave = f"{site}_status"
            if r[chave] == "ok" or site not in sites_livres:
                continue
            nome = self.sites[site]["nome"]
            try:
                arq = self.consultar_site(site, consulta["placa"], consulta["renavam"], pasta)
                r[chave] = "ok"
                r["arquivos"].append(arq)
                self.log(f"   {nome}: ok → {os.path.basename(arq)}")
            except SessaoExpirada as e:
                r["login"].append(site)
                self.precisa_login[site] = True
                if str(e) == "sem_formulario":
                    self.log(f"   {nome}: não achei os campos de placa/Renavam. Faça login na aba do {nome}; "
                             f"se já estiver logado, o site pode ter mudado (mande o F12 para ajustar).")
                else:
                    self.log(f"   {nome}: o site pediu login de novo.")
            except ErroSite as e:
                r[chave] = "erro"
                r["mensagens"].append(f"{nome}: {e}")
                self.log(f"   {nome}: {e}")
            self._dormir(0.5)
        return r
