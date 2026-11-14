// A capture-only SMTP server for test stacks (compose.test.yaml), so outgoing mail can be
// tested without a real mail server or network access. It accepts every message, keeps the
// last 50 and lists them over HTTP:
//   GET    /messages  -> [{ user, from, to, data }]   (newest last)
//   DELETE /messages  -> forget them
// It speaks plain SMTP with AUTH PLAIN, accepting any user and any password except
// "wrong-password", so tests can check both a good and a refused sign-in. No TLS: the app
// uses it only while TEST_SMTP_PLAINTEXT is set (lib/smtp.ts).
import { createServer as tcpServer } from "node:net";
import { createServer as httpServer } from "node:http";

const SMTP_PORT = 2525;
const HTTP_PORT = 8025;
const messages = [];

tcpServer((socket) => {
  socket.setEncoding("utf8");
  socket.write("220 fake-smtp ready\r\n");
  let buffer = "";
  let inData = false;
  let current = { user: "", from: "", to: [], data: "" };
  socket.on("data", (chunk) => {
    buffer += chunk;
    if (buffer.length > 262144) return socket.destroy();
    for (;;) {
      const end = buffer.indexOf("\r\n");
      if (end < 0) break;
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (inData) {
        if (line === ".") {
          messages.push({ ...current });
          if (messages.length > 50) messages.shift();
          current = { user: current.user, from: "", to: [], data: "" };
          inData = false;
          socket.write("250 queued\r\n");
        } else current.data += line.replace(/^\.\./, ".") + "\r\n";
      } else if (/^(EHLO|HELO)/i.test(line)) socket.write("250-fake-smtp\r\n250 AUTH PLAIN\r\n");
      else if (/^AUTH PLAIN /i.test(line)) {
        const [, user, password] = Buffer.from(line.slice(11), "base64").toString().split("\0");
        if (password === "wrong-password") socket.write("535 5.7.8 Authentication failed\r\n");
        else {
          current.user = user;
          socket.write("235 2.7.0 Authenticated\r\n");
        }
      } else if (/^MAIL FROM/i.test(line)) {
        current.from = line.slice(10).replace(/[<>]/g, "").trim();
        socket.write("250 OK\r\n");
      } else if (/^RCPT TO/i.test(line)) {
        current.to.push(line.slice(8).replace(/[<>]/g, "").trim());
        socket.write("250 OK\r\n");
      } else if (/^(RSET|NOOP)/i.test(line)) socket.write("250 OK\r\n");
      else if (/^DATA$/i.test(line)) {
        inData = true;
        socket.write("354 End with a dot\r\n");
      } else if (/^QUIT$/i.test(line)) socket.end("221 Bye\r\n");
      else socket.write("502 Not implemented\r\n");
    }
  });
  socket.on("error", () => {});
}).listen(SMTP_PORT, "0.0.0.0");

httpServer((request, response) => {
  if (request.url !== "/messages") return response.writeHead(404).end();
  if (request.method === "DELETE") {
    messages.length = 0;
    return response.writeHead(204).end();
  }
  if (request.method !== "GET") return response.writeHead(405).end();
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(messages));
}).listen(HTTP_PORT, "0.0.0.0");
