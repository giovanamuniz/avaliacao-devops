const express = require("express");
const mysql = require("mysql2/promise");

const PORTA = process.env.PORT || 3000;

// Origens autorizadas a chamar a API pelo navegador (a aplicação web da VM1)
const ORIGENS_PERMITIDAS = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origem) => origem.trim())
  .filter(Boolean);

// Conexão com o MySQL: "db" é o nome do serviço no docker-compose
const pool = mysql.createPool({
  host: process.env.DB_HOST || "db",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
});

const app = express();

// CORS: libera apenas a origem da aplicação web, com GET, POST e OPTIONS
app.use((req, res, next) => {
  const origem = req.headers.origin;
  if (origem && ORIGENS_PERMITIDAS.includes(origem)) {
    res.setHeader("Access-Control-Allow-Origin", origem);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  // Requisição de verificação prévia (preflight) do navegador
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());

// Verificação de saúde da API
app.get("/", (req, res) => {
  res.json({ status: "ok" });
});

// Cadastra um produto
app.post("/produto", async (req, res) => {
  const corpo = req.body || {};
  const nome = String(corpo.nome ?? "").trim();
  const categoria = String(corpo.categoria ?? "").trim();
  const preco = corpo.preco === "" || corpo.preco == null ? NaN : Number(corpo.preco);
  const quantidade = corpo.quantidade === "" || corpo.quantidade == null ? NaN : Number(corpo.quantidade);

  if (!nome || !categoria || !Number.isFinite(preco) || preco < 0 || !Number.isInteger(quantidade) || quantidade < 0) {
    return res.status(400).json({
      erro: "Informe nome, categoria, preço (decimal) e quantidade em estoque (inteiro).",
    });
  }

  try {
    const [resultado] = await pool.execute(
      "INSERT INTO produtos (nome, categoria, preco, quantidade) VALUES (?, ?, ?, ?)",
      [nome, categoria, preco, quantidade]
    );
    res.status(201).json({ id: resultado.insertId, nome, categoria, preco, quantidade });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Erro ao cadastrar o produto." });
  }
});

// Lista todos os produtos
app.get("/produtos", async (req, res) => {
  try {
    const [produtos] = await pool.query(
      "SELECT id, nome, categoria, preco, quantidade, criado_em FROM produtos ORDER BY id"
    );
    res.json(produtos);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Erro ao listar os produtos." });
  }
});

// Cria a tabela, tentando de novo enquanto o MySQL ainda está iniciando
async function prepararBanco() {
  const tentativas = 30;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS produtos (
          id INT AUTO_INCREMENT PRIMARY KEY,
          nome VARCHAR(150) NOT NULL,
          categoria VARCHAR(100) NOT NULL,
          preco DECIMAL(10, 2) NOT NULL,
          quantidade INT NOT NULL,
          criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log("Banco de dados pronto.");
      return;
    } catch (erro) {
      console.log(`Aguardando o MySQL (tentativa ${tentativa}/${tentativas}): ${erro.code || erro.message}`);
      await new Promise((resolver) => setTimeout(resolver, 3000));
    }
  }
  throw new Error("Não foi possível conectar ao MySQL.");
}

prepararBanco()
  .then(() => {
    app.listen(PORTA, () => console.log(`API ouvindo na porta ${PORTA}`));
  })
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
