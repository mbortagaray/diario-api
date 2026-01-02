const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: '✅ API Puppeteer rodando!',
    version: '1.0.0',
    endpoints: {
      health: 'GET /',
      scrape: 'POST /scrape-diario',
      screenshot: 'GET /screenshot'
    },
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Rota principal de scraping para Diário de Belém
app.post('/scrape-diario', async (req, res) => {
  let browser;
  
  try {
    const { palavraChave, numeroDiario, dataInicial, dataFinal } = req.body;
    
    console.log('📥 Requisição recebida:', { 
      palavraChave, 
      numeroDiario, 
      dataInicial, 
      dataFinal 
    });
    
    // Inicia o browser
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions'
      ]
    });
    
    const page = await browser.newPage();
    
    // Configura user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });
    
    console.log('🌐 Acessando página do Diário de Belém...');
    await page.goto('https://sistemas.belem.pa.gov.br/diario/painel', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Aguarda carregamento
    await page.waitForTimeout(3000);
    
    // Preenche palavra-chave
    if (palavraChave) {
      console.log('✏️ Preenchendo palavra-chave...');
      const selectors = [
        'input[placeholder*="palavra"]',
        'input[name*="palavra"]',
        'textarea[placeholder*="palavra"]',
        'textarea'
      ];
      
      for (const selector of selectors) {
        const input = await page.$(selector);
        if (input) {
          await input.click({ clickCount: 3 });
          await input.type(palavraChave, { delay: 100 });
          console.log('✅ Palavra-chave preenchida');
          break;
        }
      }
    }
    
    // Preenche número do diário
    if (numeroDiario) {
      console.log('🔢 Preenchendo número do diário...');
      const input = await page.$('input[type="number"], input[placeholder*="número"]');
      if (input) {
        await input.click({ clickCount: 3 });
        await input.type(String(numeroDiario), { delay: 100 });
        console.log('✅ Número preenchido');
      }
    }
    
    // Preenche data inicial
    if (dataInicial) {
      console.log('📅 Preenchendo data inicial...');
      const inputs = await page.$$('input[type="date"]');
      if (inputs.length > 0) {
        const dataFormatada = dataInicial.split('T')[0];
        await inputs[0].evaluate((el, val) => {
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, dataFormatada);
        console.log('✅ Data inicial preenchida');
      }
    }
    
    // Preenche data final
    if (dataFinal) {
      console.log('📅 Preenchendo data final...');
      const inputs = await page.$$('input[type="date"]');
      if (inputs.length > 1) {
        const dataFormatada = dataFinal.split('T')[0];
        await inputs[1].evaluate((el, val) => {
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, dataFormatada);
        console.log('✅ Data final preenchida');
      }
    }
    
    await page.waitForTimeout(1500);
    
    // Clica no botão de pesquisar
    console.log('🔍 Procurando botão de pesquisa...');
    const botoes = await page.$$('button, input[type="submit"]');
    let clicou = false;
    
    for (const botao of botoes) {
      const texto = await page.evaluate(el => el.textContent.toLowerCase(), botao);
      if (texto.includes('pesquisar') || 
          texto.includes('buscar') || 
          texto.includes('filtrar') ||
          texto.includes('consultar')) {
        await botao.click();
        clicou = true;
        console.log('✅ Botão de pesquisa clicado!');
        break;
      }
    }
    
    if (!clicou) {
      console.log('⚠️ Botão de pesquisa não encontrado, tentando Enter...');
      await page.keyboard.press('Enter');
    }
    
    // Aguarda resultados
    console.log('⏳ Aguardando resultados...');
    await page.waitForTimeout(5000);
    
    // Extrai os resultados
    console.log('📊 Extraindo dados...');
    const resultados = await page.evaluate(() => {
      const dados = [];
      
      // Tenta múltiplos seletores para encontrar os resultados
      const seletores = [
        'table tbody tr',
        '.resultado-item',
        '.diario-item',
        '[class*="resultado"]',
        '[class*="diario"]',
        '[class*="item"]'
      ];
      
      let linhas = [];
      for (const seletor of seletores) {
        linhas = document.querySelectorAll(seletor);
        if (linhas.length > 0) break;
      }
      
      linhas.forEach((linha, index) => {
        const texto = linha.innerText.trim();
        
        if (texto.length > 10) {
          const colunas = linha.querySelectorAll('td, .coluna, div');
          const colunasTexto = Array.from(colunas)
            .map(c => c.innerText.trim())
            .filter(t => t.length > 0);
          
          dados.push({
            id: index + 1,
            textoCompleto: texto,
            colunas: colunasTexto
          });
        }
      });
      
      // Busca links de PDF
      const pdfs = [];
      const linksPdf = document.querySelectorAll('a[href*=".pdf"], a[download], a[href*="diario"]');
      
      linksPdf.forEach((link, index) => {
        if (link.href && link.href.length > 0) {
          pdfs.push({
            id: index + 1,
            titulo: link.innerText.trim() || link.title || `Diário ${index + 1}`,
            url: link.href,
            tamanho: link.getAttribute('data-size') || null
          });
        }
      });
      
      return {
        totalResultados: dados.length,
        totalPDFs: pdfs.length,
        temResultados: dados.length > 0 || pdfs.length > 0,
        diarios: dados,
        pdfs: pdfs
      };
    });
    
    await browser.close();
    
    console.log(`✅ Scraping concluído! ${resultados.totalResultados} resultados, ${resultados.totalPDFs} PDFs encontrados`);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      parametros: {
        palavraChave,
        numeroDiario,
        dataInicial,
        dataFinal
      },
      resultados: resultados
    });
    
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    
    console.error('❌ Erro no scraping:', error.message);
    
    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Rota para tirar screenshot (debug)
app.get('/screenshot', async (req, res) => {
  let browser;
  
  try {
    const url = req.query.url || 'https://sistemas.belem.pa.gov.br/diario/painel';
    
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const screenshot = await page.screenshot({ fullPage: true });
    await browser.close();
    
    res.type('png').send(screenshot);
    
  } catch (error) {
    if (browser) await browser.close();
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API Puppeteer rodando na porta ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/`);
  console.log(`📍 Scrape: POST http://localhost:${PORT}/scrape-diario`);
  console.log(`📍 Screenshot: GET http://localhost:${PORT}/screenshot`);
});
