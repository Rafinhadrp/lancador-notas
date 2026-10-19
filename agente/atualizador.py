"""Atualização automática do programa do PC.

A release "programa" do GitHub (repositório público) tem o LancadorNotas.exe e um versao.json:
{"versao": "1.2.0", "obrigatoria": false, "novidades": "...", "sha256": "...", "tamanho": 123}

O Windows não deixa substituir um .exe aberto, então a troca é feita por um .bat que espera o
programa fechar, guarda o antigo como .old, coloca o novo no lugar e abre de novo.
"""
import hashlib
import os
import subprocess
import sys

import requests

URL_VERSAO = "https://github.com/Rafinhadrp/lancador-notas/releases/download/programa/versao.json"
URL_EXE = "https://github.com/Rafinhadrp/lancador-notas/releases/download/programa/LancadorNotas.exe"


def numeros(versao):
    """'1.10.2' -> (1, 10, 2). Partes que não são número viram 0."""
    partes = []
    for p in str(versao or "").strip().lstrip("vV").split("."):
        try:
            partes.append(int(p))
        except ValueError:
            partes.append(0)
    while len(partes) < 3:
        partes.append(0)
    return tuple(partes)


def mais_nova(remota, local):
    return numeros(remota) > numeros(local)


def verificar(versao_atual, http=None, url=URL_VERSAO):
    """Devolve o versao.json se houver versão mais nova; senão None. Erros de rede levantam exceção."""
    http = http or requests
    r = http.get(url, timeout=15, headers={"Cache-Control": "no-cache"})
    r.raise_for_status()
    info = r.json()
    if not info.get("versao") or not mais_nova(info["versao"], versao_atual):
        return None
    return info


def baixar(info, pasta, progresso=lambda feito, total: None, cancelar=None, http=None, url=URL_EXE):
    """Baixa o .exe novo, confere tamanho e sha256 e devolve o caminho. Levanta RuntimeError se não bater."""
    http = http or requests
    os.makedirs(pasta, exist_ok=True)
    destino = os.path.join(pasta, f"LancadorNotas-{info['versao']}.exe")
    parcial = destino + ".baixando"
    total = int(info.get("tamanho") or 0)
    h = hashlib.sha256()
    feito = 0
    try:
        with http.get(url, stream=True, timeout=60) as r:
            r.raise_for_status()
            total = total or int(r.headers.get("Content-Length") or 0)
            with open(parcial, "wb") as f:
                for bloco in r.iter_content(256 * 1024):
                    if cancelar is not None and cancelar.is_set():
                        raise RuntimeError("Download cancelado.")
                    f.write(bloco)
                    h.update(bloco)
                    feito += len(bloco)
                    progresso(feito, total)
        if info.get("tamanho") and feito != int(info["tamanho"]):
            raise RuntimeError(f"O download veio incompleto ({feito} de {info['tamanho']} bytes). Tente de novo.")
        if info.get("sha256") and h.hexdigest().lower() != str(info["sha256"]).lower():
            raise RuntimeError("O arquivo baixado não confere com a versão publicada. Tente de novo em alguns minutos.")
        if os.path.exists(destino):
            os.remove(destino)
        os.replace(parcial, destino)
        return destino
    except Exception:
        try:
            os.remove(parcial)
        except OSError:
            pass
        raise


def script_troca(exe_atual, exe_novo, arq_falha, pid=0):
    """Conteúdo do .bat que troca o arquivo depois que o programa fecha.

    Espera com "ping" (o "timeout" do Windows não funciona sem janela) e espera o processo antigo
    sumir antes de trocar (o Windows deixa renomear um .exe aberto).
    """
    return f"""@echo off
chcp 65001 >nul
set w=0
:espera
tasklist /FI "PID eq {pid}" /NH 2>nul | find " {pid} " >nul
if errorlevel 1 goto pronto
set /a w=w+1
if %w% geq 30 goto matar
ping -n 2 127.0.0.1 >nul
goto espera
:matar
taskkill /PID {pid} /F >nul 2>&1
ping -n 3 127.0.0.1 >nul
:pronto
set n=0
:troca
move /Y "{exe_atual}" "{exe_atual}.old" >nul 2>&1
if not errorlevel 1 goto mover
set /a n=n+1
if %n% geq 60 goto falhou
ping -n 2 127.0.0.1 >nul
goto troca
:mover
move /Y "{exe_novo}" "{exe_atual}" >nul 2>&1
if not errorlevel 1 goto abrir
move /Y "{exe_atual}.old" "{exe_atual}" >nul 2>&1
goto falhou
:abrir
start "" "{exe_atual}"
(goto) 2>nul & del "%~f0"
:falhou
echo Nao consegui trocar o arquivo do programa. > "{arq_falha}"
start "" "{exe_atual}"
(goto) 2>nul & del "%~f0"
"""


def ambiente_limpo():
    """Ambiente para abrir a versão nova como um programa novo (sem herdar a pasta temporária do PyInstaller)."""
    env = {k: v for k, v in os.environ.items() if not k.startswith("_PYI") and k != "_MEIPASS2"}
    env["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
    return env


def aplicar(exe_novo, pasta_dados):
    """Dispara a troca do arquivo. Depois disso o programa precisa fechar logo."""
    if not getattr(sys, "frozen", False) or not sys.platform.startswith("win"):
        raise RuntimeError("A atualização automática só funciona no LancadorNotas.exe no Windows.")
    exe_atual = sys.executable
    # no .exe de arquivo único, quem segura o arquivo é o processo "pai" (o carregador do PyInstaller)
    meipass = getattr(sys, "_MEIPASS", "")
    um_arquivo = bool(meipass) and os.path.normcase(os.path.dirname(exe_atual)) != os.path.normcase(meipass)
    pid = os.getppid() if um_arquivo else os.getpid()
    arq_falha = os.path.join(pasta_dados, "atualizacao_falhou.txt")
    try:
        os.remove(arq_falha)
    except OSError:
        pass
    bat = os.path.join(pasta_dados, "atualizar.bat")
    with open(bat, "w", encoding="utf-8") as f:
        f.write(script_troca(exe_atual, exe_novo, arq_falha, pid))
    # só CREATE_NO_WINDOW: com DETACHED_PROCESS junto, cada comando do .bat (tasklist, find) abria uma janela preta
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    subprocess.Popen(["cmd", "/c", bat], creationflags=flags, env=ambiente_limpo(), close_fds=True,
                     cwd=os.path.dirname(exe_atual))


def limpar_restos(pasta_dados):
    """Na abertura: apaga o .old da versão anterior e devolve a mensagem de falha da última troca, se houver."""
    if getattr(sys, "frozen", False):
        try:
            os.remove(sys.executable + ".old")
        except OSError:
            pass
    arq = os.path.join(pasta_dados, "atualizacao_falhou.txt")
    if os.path.exists(arq):
        try:
            with open(arq, encoding="utf-8", errors="replace") as f:
                msg = f.read().strip()
            os.remove(arq)
            return msg or "A última atualização não deu certo."
        except OSError:
            pass
    return ""
