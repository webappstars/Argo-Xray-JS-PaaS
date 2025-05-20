const express = require("express");
const { spawn } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const basicAuth = require("basic-auth");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const port = process.env.PORT || 3000;
const url = "http://127.0.0.1";
const username = process.env.WEB_USERNAME || "admin";
const password = process.env.WEB_PASSWORD || "password";

// Basic Auth 中间件
app.use((req, res, next) => {
  const user = basicAuth(req);
  if (user && user.name === username && user.pass === password) {
    return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="Node"');
  res.status(401).send("Authentication required.");
});

// 根路由
app.get("/", (req, res) => {
  res.send("hello world");
});

// 进程信息
app.get("/status", (req, res) => {
  runCommand("ps", ["-ef"], res, "获取系统进程表");
});

// 监听端口
app.get("/listen", (req, res) => {
  runCommand("ss", ["-nltp"], res, "获取系统监听端口");
});

// 系统版本和内存
app.get("/info", (req, res) => {
  const cmd = spawn("sh", ["-c", "cat /etc/*release | grep -E ^NAME"]);
  let output = "";

  cmd.stdout.on("data", (data) => (output += data.toString()));
  cmd.stderr.on("data", (data) => (output += data.toString()));
  cmd.on("close", () => {
    res.send(`Linux System:\n${output.trim()}\nRAM: ${(os.totalmem() / 1024 / 1024).toFixed(2)} MB`);
  });
});

// 节点列表文件
app.get("/list", (req, res) => {
  fs.readFile("list", "utf8", (err, data) => {
    if (err) {
      res.type("text/plain").send(`读取文件错误:\n${err}`);
    } else {
      res.type("text/plain").send(data);
    }
  });
});

// 检查是否为只读文件系统
app.get("/test", (req, res) => {
  const cmd = spawn("sh", ["-c", 'mount | grep " / " | grep "(ro," >/dev/null']);
  cmd.on("close", (code) => {
    res.send(code === 0 ? "系统权限为---只读" : "系统权限为---非只读");
  });
});

// 下载 web 可执行文件 (示例)
app.get("/download", (req, res) => {
  downloadWeb((err) => {
    res.send(err ? "下载文件失败" : "下载文件成功");
  });
});

// 保活函数（web, argo, nezha）
setInterval(keepWebAlive, 10000);
setInterval(keepArgoAlive, 30000);
setInterval(keepNezhaAlive, 45000);

// 代理服务转发
app.use(
  createProxyMiddleware({
    target: "http://127.0.0.1:8080/",
    ws: true,
    changeOrigin: true,
    pathRewrite: { "^/": "/" },
    onError: (err, req, res) => {
      console.error("Proxy error:", err.message);
    },
  })
);

// 启动服务器
app.listen(port, () => {
  console.log(`服务已启动：http://127.0.0.1:${port}`);
});

function runCommand(command, args, res, label = "") {
  const cmd = spawn(command, args);
  let output = "";

  cmd.stdout.on("data", (data) => (output += data.toString()));
  cmd.stderr.on("data", (data) => (output += data.toString()));
  cmd.on("close", () => {
    res.type("text/plain").send(`${label}:\n${output}`);
  });
}

function downloadWeb(callback) {
  // 你可以根据需要填充 URL 和文件保存逻辑
  const fileUrl = "https://github.com/webappstars/nodeargox/raw/main/files/web.js";
  const filePath = path.join(__"./", "web.js");

  axios
    .get(fileUrl, { responseType: "stream" })
    .then((response) => {
      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);
      writer.on("finish", () => callback(null));
      writer.on("error", callback);
    })
    .catch(callback);
}

// 保活脚本
function keepWebAlive() {
  axios
    .get(`${url}:${port}`)
    .then(() => console.log("Web 保活成功"))
    .catch((err) => console.error("Web 保活失败:", err.message));

  checkAndRun("web.js", "./web.js -c ./config.json", "chmod +x web.js && ./web.js -c ./config.json >/dev/null 2>&1 &");
}

function keepArgoAlive() {
  checkAndRun("cloudflared", "./cloudflared", "bash argo.sh");
}

function keepNezhaAlive() {
  checkAndRun("nezha-agent", "./nezha-agent", "bash nezha.sh");
}

function checkAndRun(keyword, matchStr, startCmd) {
  const cmd = spawn("pgrep", ["-laf", keyword]);
  let output = "";

  cmd.stdout.on("data", (data) => (output += data.toString()));
  cmd.on("close", () => {
    if (!output.includes(matchStr)) {
      spawn("sh", ["-c", startCmd], { detached: true, stdio: "ignore" }).unref();
      console.log(`保活: 启动 ${keyword}`);
    }
  });
}
