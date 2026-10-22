"""
Conversa com a tela de abertura do .exe (splash do PyInstaller, script em gerar_exe.py).

O bootloader abre um servidor TCP local e passa a porta em _PYI_SPLASH_IPC. Cada linha
"update_text(@texto)" troca a frase embaixo da barra; "@FIM" enche a barra; fechar a conexão
fecha a tela. Fora do .exe (rodando pelo Python) não faz nada.
"""
import atexit
import os
import socket
import time

_conexao = None


def _conectar():
    global _conexao
    porta = os.environ.pop("_PYI_SPLASH_IPC", None)
    if not porta:
        return
    try:
        _conexao = socket.create_connection(("127.0.0.1", int(porta)), timeout=2)
    except (OSError, ValueError):
        _conexao = None


def fase(texto):
    """Troca a frase embaixo da barra (ex.: "Abrindo a janela…")."""
    global _conexao
    if not _conexao:
        return
    try:
        _conexao.sendall(f"update_text(@{texto})".encode("utf-8") + b"\r")
    except OSError:
        _conexao = None


def fechar():
    """Enche a barra e fecha a tela de abertura."""
    global _conexao
    if not _conexao:
        return
    fase("FIM")
    time.sleep(0.35)  # tempo de a barra chegar ao fim
    try:
        _conexao.sendall(b"\x04")
        _conexao.close()
    except OSError:
        pass
    _conexao = None


_conectar()
fase("Carregando o programa…")
atexit.register(fechar)
