// Timer num Worker: o Chrome freia os timers de abas em segundo plano, mas não os de Workers.
onmessage = (e) => setTimeout(() => postMessage(e.data.id), e.data.ms);
