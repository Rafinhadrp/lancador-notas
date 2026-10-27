/* Lê planilhas no próprio navegador, sem biblioteca: .xls (Excel antigo, BIFF8 — é o que o Autos 360 exporta),
   .xlsx, .csv/.txt e tabela HTML. Planilha.ler(arquivo) devolve as linhas da 1ª aba como listas de textos. */
(function () {
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000;
  const FIM = 0xfffffffa;  // FREESECT/ENDOFCHAIN e afins

  // ------------------------------------------------------------ .xls: arquivo "Compound File" (CFB) com o stream Workbook
  function streamCFB(b, nomes) {
    if (u32(b, 0) !== 0xe011cfd0 || u32(b, 4) !== 0xe11ab1a1) throw new Error('Arquivo .xls inválido.');
    const ss = 1 << u16(b, 0x1e), mss = 1 << u16(b, 0x20);
    const setor = (n) => b.subarray((n + 1) * ss, (n + 2) * ss);
    // FAT: setores listados no DIFAT (109 no cabeçalho + cadeia de setores DIFAT)
    const difat = [];
    for (let i = 0; i < 109; i++) difat.push(u32(b, 0x4c + i * 4));
    for (let d = u32(b, 0x44), n = u32(b, 0x48); n-- > 0 && d < FIM;) {
      const s = setor(d);
      for (let i = 0; i < ss / 4 - 1; i++) difat.push(u32(s, i * 4));
      d = u32(s, ss - 4);
    }
    const fat = [];
    difat.filter((x) => x < FIM).slice(0, u32(b, 0x2c)).forEach((n) => { const s = setor(n); for (let i = 0; i < ss; i += 4) fat.push(u32(s, i)); });
    const cadeia = (ini, tab) => { const r = []; for (let n = ini; n < FIM && r.length <= tab.length; n = tab[n]) r.push(n); return r; };
    const juntar = (partes) => { const t = new Uint8Array(partes.reduce((a, p) => a + p.length, 0)); let o = 0; partes.forEach((p) => { t.set(p, o); o += p.length; }); return t; };
    const dir = juntar(cadeia(u32(b, 0x30), fat).map(setor));
    const entradas = [];
    for (let o = 0; o + 128 <= dir.length; o += 128) {
      const len = u16(dir, o + 0x40);
      let nome = '';
      for (let i = 0; i + 2 < len; i += 2) nome += String.fromCharCode(u16(dir, o + i));
      entradas.push({ nome, tipo: dir[o + 0x42], ini: u32(dir, o + 0x74), tam: u32(dir, o + 0x78) });
    }
    const e = entradas.find((x) => x.tipo === 2 && nomes.includes(x.nome));
    if (!e) throw new Error('Não achei a planilha dentro do arquivo .xls.');
    if (e.tam < u32(b, 0x38)) {  // stream pequeno: fica no "mini stream" da raiz
      const raiz = entradas.find((x) => x.tipo === 5);
      const mini = juntar(cadeia(raiz.ini, fat).map(setor));
      const minifat = [];
      cadeia(u32(b, 0x3c), fat).forEach((n) => { const s = setor(n); for (let i = 0; i < ss; i += 4) minifat.push(u32(s, i)); });
      return juntar(cadeia(e.ini, minifat).map((n) => mini.subarray(n * mss, (n + 1) * mss))).subarray(0, e.tam);
    }
    return juntar(cadeia(e.ini, fat).map(setor)).subarray(0, e.tam);
  }

  // leitor que atravessa SST + CONTINUE (nos textos, cada CONTINUE recomeça com 1 byte de "largura")
  function leitor(partes) {
    let p = 0, o = 0;
    const byte = () => { while (o >= partes[p].length) { p++; o = 0; if (p >= partes.length) throw new Error('fim'); } return partes[p][o++]; };
    const r = {
      u8: byte,
      u16: () => byte() | (byte() << 8),
      u32: () => (byte() | (byte() << 8) | (byte() << 16)) + byte() * 0x1000000,
      pular: (n) => { while (n-- > 0) byte(); },
      texto() {
        const cch = r.u16(), flags = r.u8();
        let largo = flags & 1;
        const runs = flags & 8 ? r.u16() : 0, ext = flags & 4 ? r.u32() : 0;
        let s = '';
        for (let i = 0; i < cch; i++) {
          if (o >= partes[p].length) { p++; o = 0; largo = partes[p][o++] & 1; }
          s += String.fromCharCode(largo ? r.u16() : r.u8());
        }
        r.pular(runs * 4 + ext);
        return s;
      },
    };
    return r;
  }

  function rk(v) {
    let n;
    if (v & 2) n = (v | 0) >> 2;
    else { const d = new DataView(new ArrayBuffer(8)); d.setUint32(0, v & 0xfffffffc); d.setUint32(4, 0); n = d.getFloat64(0); }
    return v & 1 ? n / 100 : n;
  }
  const numTexto = (n) => (Number.isInteger(n) ? String(n) : String(n).replace('.', ','));

  function lerXLS(buf) {
    const w = streamCFB(new Uint8Array(buf), ['Workbook', 'Book']);
    const sst = [], linhas = [];
    let bofs = 0, sstPartes = null;
    const por = (l, c, v) => { (linhas[l] = linhas[l] || [])[c] = v; };
    for (let o = 0; o + 4 <= w.length;) {
      const id = u16(w, o), len = u16(w, o + 2), d = w.subarray(o + 4, o + 4 + len);
      o += 4 + len;
      if (sstPartes && id !== 0x003c) {  // fim do SST: decodifica
        const r = leitor(sstPartes); r.pular(8);
        try { for (;;) sst.push(r.texto()); } catch (_) { /* acabou */ }
        sstPartes = null;
      }
      if (id === 0x0809) { bofs++; if (bofs > 2) break; continue; }  // só a 1ª aba
      if (id === 0x00fc) { sstPartes = [d]; continue; }
      if (id === 0x003c && sstPartes) { sstPartes.push(d); continue; }
      if (bofs < 2) continue;
      if (id === 0x00fd) por(u16(d, 0), u16(d, 2), sst[u32(d, 6)] ?? '');
      else if (id === 0x0204) por(u16(d, 0), u16(d, 2), leitor([d.subarray(6)]).texto());
      else if (id === 0x0203) por(u16(d, 0), u16(d, 2), numTexto(new DataView(d.buffer, d.byteOffset + 6, 8).getFloat64(0, true)));
      else if (id === 0x027e) por(u16(d, 0), u16(d, 2), numTexto(rk(u32(d, 6))));
      else if (id === 0x00bd) {
        const l = u16(d, 0), c0 = u16(d, 2);
        for (let i = 0; 4 + i * 6 + 6 <= len - 2; i++) por(l, c0 + i, numTexto(rk(u32(d, 4 + i * 6 + 2))));
      }
    }
    return linhas.filter(Boolean).map((l) => Array.from(l, (v) => (v == null ? '' : String(v).trim())));
  }

  // ------------------------------------------------------------ .xlsx: zip com XML
  async function lerZip(buf) {
    const b = new Uint8Array(buf);
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Arquivo .xlsx inválido.');
    const arquivos = {};
    for (let o = u32(b, eocd + 16), n = u16(b, eocd + 10); n-- > 0;) {
      const metodo = u16(b, o + 10), tam = u32(b, o + 20), lnome = u16(b, o + 28), lextra = u16(b, o + 30), lcom = u16(b, o + 32), local = u32(b, o + 42);
      const nome = new TextDecoder().decode(b.subarray(o + 46, o + 46 + lnome));
      arquivos[nome] = { metodo, tam, local };
      o += 46 + lnome + lextra + lcom;
    }
    return async (nome) => {
      const a = arquivos[nome];
      if (!a) return null;
      const ini = a.local + 30 + u16(b, a.local + 26) + u16(b, a.local + 28);
      const dados = b.subarray(ini, ini + a.tam);
      if (a.metodo === 0) return new TextDecoder().decode(dados);
      const s = new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(s).text();
    };
  }

  async function lerXLSX(buf) {
    const abrir = await lerZip(buf);
    const xml = (t) => new DOMParser().parseFromString(t, 'application/xml');
    const sst = [];
    const ss = await abrir('xl/sharedStrings.xml');
    if (ss) [...xml(ss).getElementsByTagName('si')].forEach((si) => sst.push([...si.getElementsByTagName('t')].map((t) => t.textContent).join('')));
    const folha = await abrir('xl/worksheets/sheet1.xml');
    if (!folha) throw new Error('Não achei a planilha dentro do .xlsx.');
    const col = (ref) => { let n = 0; for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
    return [...xml(folha).getElementsByTagName('row')].map((row) => {
      const l = [];
      [...row.getElementsByTagName('c')].forEach((c, i) => {
        const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0]?.textContent ?? '';
        const valor = t === 's' ? sst[+v] ?? '' : t === 'inlineStr' ? [...c.getElementsByTagName('t')].map((x) => x.textContent).join('') : v;
        l[c.getAttribute('r') ? col(c.getAttribute('r')) : i] = String(valor).trim();
      });
      return Array.from(l, (v) => v ?? '');
    });
  }

  // ------------------------------------------------------------ texto: CSV/TXT ou tabela HTML
  function lerTexto(t) {
    if (/<table/i.test(t)) {
      const doc = new DOMParser().parseFromString(t, 'text/html');
      return [...doc.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('th,td')].map((c) => c.textContent.trim()));
    }
    const linhas = t.split(/\r?\n/).filter((l) => l.trim());
    const sep = ['\t', ';', ','].find((s) => linhas.slice(0, 5).some((l) => l.includes(s))) || '\t';
    return linhas.map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim()));
  }

  window.Planilha = {
    async ler(arquivo) {
      const buf = await arquivo.arrayBuffer();
      const b = new Uint8Array(buf.slice(0, 8));
      if (b[0] === 0xd0 && b[1] === 0xcf) return lerXLS(buf);
      if (b[0] === 0x50 && b[1] === 0x4b) return lerXLSX(buf);
      let t = new TextDecoder('utf-8').decode(buf);
      if (t.includes('�')) t = new TextDecoder('windows-1252').decode(buf);
      return lerTexto(t);
    },
  };
})();
