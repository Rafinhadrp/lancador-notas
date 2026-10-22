import abertura
import time, tkinter
time.sleep(3)
abertura.fase("Abrindo a janela…")
r = tkinter.Tk(); r.title("APP"); r.geometry("300x200")
r.after(1500, abertura.fechar)
r.after(4000, r.destroy)
r.mainloop()
print("APP: terminou")
