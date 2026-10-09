"""Conexão do programa do PC com a central (Vercel + Supabase)."""
import re
import socket
import unicodedata
import threading
import time
from datetime import datetime, timezone

import requests

VERSAO = "1.1.0"


def agora_iso():
    return datetime.now(timezone.utc).isoformat()


class ErroCentral(Exception):
    pass


class Central:
    def __init__(self, endereco: str):
        self.endereco = endereco.strip().rstrip("/")
        if self.endereco and not self.endereco.startswith("http"):
            self.endereco = "https://" + self.endereco
        self.sb_url = ""
        self.anon = ""
        self.dominio = ""
        self.access = ""
        self.refresh_token = ""
        self.expira = 0.0
        self.user_id = ""
        self.perfil = {}
        self.maquina = socket.gethostname()
        self._trava = threading.Lock()
        self.http = requests.Session()

    # ------------------------------------------------------------ configuração e login
    def carregar_config(self):
        try:
            r = self.http.get(f"{self.endereco}/api/config", timeout=15)
        except requests.RequestException:
            raise ErroCentral("Não consegui acessar a central. Confira o endereço e a internet.")
        try:
            d = r.json()
        except ValueError:
            raise ErroCentral("Esse endereço não é da central do Lançador de Notas.")
        if not r.ok:
            raise ErroCentral(d.get("erro") or f"Erro {r.status_code} na central.")
        self.sb_url, self.anon, self.dominio = d["supabaseUrl"], d["anonKey"], d["dominio"]

    def _auth(self, grant: str, corpo: dict) -> dict:
        r = self.http.post(
            f"{self.sb_url}/auth/v1/token?grant_type={grant}",
            json=corpo, headers={"apikey": self.anon}, timeout=20,
        )
        d = r.json() if r.content else {}
        if not r.ok:
            msg = d.get("error_description") or d.get("msg") or d.get("error") or ""
            if "invalid" in msg.lower():
                raise ErroCentral("Usuário ou senha incorretos.")
            if "banned" in msg.lower():
                raise ErroCentral("Usuário desativado. Fale com o administrador.")
            raise ErroCentral(msg or "Falha no login.")
        self.access = d["access_token"]
        self.refresh_token = d["refresh_token"]
        self.expira = time.time() + int(d.get("expires_in", 3600)) - 120
        self.user_id = d["user"]["id"]
        return d

    def entrar(self, usuario: str, senha: str):
        self.carregar_config()
        u = unicodedata.normalize("NFD", usuario.strip().lower())
        u = re.sub(r"[^a-z0-9._-]", "", "".join(c for c in u if unicodedata.category(c) != "Mn"))
        email = f"{u}@{self.dominio}"
        self._auth("password", {"email": email, "password": senha})
        self._carregar_perfil()

    def entrar_com_token(self, refresh_token: str):
        self.carregar_config()
        self.refresh_token = refresh_token
        self._renovar()
        self._carregar_perfil()

    def _renovar(self):
        with self._trava:
            self._auth("refresh_token", {"refresh_token": self.refresh_token})

    def _carregar_perfil(self):
        p = self.rest("GET", "perfis", params={"id": f"eq.{self.user_id}", "select": "*"})
        if not p or not p[0].get("ativo"):
            raise ErroCentral("Usuário desativado. Fale com o administrador.")
        self.perfil = p[0]

    def _cabecalhos(self, extra=None):
        if time.time() > self.expira:
            self._renovar()
        h = {"apikey": self.anon, "Authorization": f"Bearer {self.access}"}
        h.update(extra or {})
        return h

    # ------------------------------------------------------------ banco (REST do Supabase)
    def rest(self, metodo, tabela, params=None, json=None, prefer=None):
        for tentativa in (1, 2):
            extra = {"Prefer": prefer} if prefer else {}
            try:
                r = self.http.request(
                    metodo, f"{self.sb_url}/rest/v1/{tabela}", params=params, json=json,
                    headers=self._cabecalhos(extra), timeout=20,
                )
            except requests.RequestException as e:
                raise ErroCentral(f"Sem conexão com a central ({e.__class__.__name__}).")
            if r.status_code == 401 and tentativa == 1:
                self._renovar()
                continue
            if not r.ok:
                try:
                    msg = r.json().get("message")
                except ValueError:
                    msg = r.text
                raise ErroCentral(msg or f"Erro {r.status_code}")
            return r.json() if r.content else None

    def batimento(self, pausado: bool):
        self.rest(
            "POST", "agentes",
            params={"on_conflict": "user_id"},
            json={"user_id": self.user_id, "maquina": self.maquina, "versao": VERSAO,
                  "pausado": pausado, "visto_em": agora_iso()},
            prefer="resolution=merge-duplicates,return=minimal",
        )

    def proxima_nota(self):
        """Pega a nota mais antiga na fila e marca como 'lancando' (sem risco de pegar duas vezes)."""
        fila = self.rest("GET", "notas", params={
            "user_id": f"eq.{self.user_id}", "status": "eq.pendente",
            "order": "id.asc", "limit": "1", "select": "*",
        })
        if not fila:
            return None
        nota = fila[0]
        pegou = self.rest(
            "PATCH", "notas",
            params={"id": f"eq.{nota['id']}", "status": "eq.pendente"},
            json={"status": "lancando", "maquina": self.maquina, "mensagem": ""},
            prefer="return=representation",
        )
        return pegou[0] if pegou else None

    def concluir(self, nota_id, status, mensagem=""):
        corpo = {"status": status, "mensagem": mensagem}
        if status == "lancada":
            corpo["lancado_em"] = agora_iso()
        self.rest("PATCH", "notas", params={"id": f"eq.{nota_id}"}, json=corpo, prefer="return=minimal")

    def recuperar_presas(self):
        """Notas que ficaram 'lancando' porque o programa foi fechado no meio."""
        self.rest(
            "PATCH", "notas",
            params={"user_id": f"eq.{self.user_id}", "status": "eq.lancando"},
            json={"status": "erro", "mensagem": "O programa foi fechado durante o lançamento. Confira no sistema e reenvie se preciso."},
            prefer="return=minimal",
        )

    def contar(self, status, desde_iso=None):
        params = {"user_id": f"eq.{self.user_id}", "status": f"eq.{status}", "select": "id,valor"}
        if desde_iso:
            params["lancado_em"] = f"gte.{desde_iso}"
        return self.rest("GET", "notas", params=params) or []

    def historico(self, limite=40):
        return self.rest("GET", "notas", params={
            "user_id": f"eq.{self.user_id}", "order": "id.desc", "limit": str(limite), "select": "*",
        }) or []

    # ------------------------------------------------------------ escolha do veículo
    def escolher_veiculo(self, png_b64, placa, largura, altura):
        r = self.http.post(
            f"{self.endereco}/api/veiculo",
            json={"imagem": png_b64, "placa": placa, "largura": largura, "altura": altura},
            headers=self._cabecalhos(), timeout=40,
        )
        d = r.json() if r.content else {}
        if not r.ok:
            raise ErroCentral(d.get("erro") or f"Erro {r.status_code} ao escolher o veículo.")
        return d
