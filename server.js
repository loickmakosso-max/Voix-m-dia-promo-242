const http = require("http");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<h1>Voix média promo 242</h1><p>Le site fonctionne !</p>");
});

server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
