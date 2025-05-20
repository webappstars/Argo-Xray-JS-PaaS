import express from "express";
import { exec } from "child_process";
import os from "os";
import { createWriteStream } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import request from "request";
import auth from "basic-auth";
import { createProxyMiddleware } from "http-proxy-middleware";

const username = process.env.WEB_USERNAME || "admin";
const password = process.env.WEB_PASSWORD || "password";
const url = "http://127.0.0.1";
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.get("/", function (req, res) {
  res.send("مرحبا بالعالم");
});

app.use((req, res, next) => {
  const user = auth(req);
  if (user && user.name === username && user.pass === password) {
    return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="Node"');
  return res.status(401).send();
});

app.get("/status", function (req, res) {
  exec("ps -ef", function (err, stdout, stderr) {
    if (err) {
      res.type("html").send("<pre>خطأ في تنفيذ الأمر:\n" + err + "</pre>");
    } else {
      res.type("html").send("<pre>قائمة العمليات:\n" + stdout + "</pre>");
    }
  });
});

app.get("/listen", function (req, res) {
  exec("ss -nltp", function (err, stdout, stderr) {
    if (err) {
      res.type("html").send("<pre>خطأ في تنفيذ الأمر:\n" + err + "</pre>");
    } else {
      res.type("html").send("<pre>المنافذ المستمعة:\n" + stdout + "</pre>");
    }
  });
});

app.get("/list", function (req, res) {
  exec("cat list", function (err, stdout, stderr) {
    if (err) {
      res.type("html").send("<pre>خطأ في تنفيذ الأمر:\n" + err + "</pre>");
    } else {
      res.type("html").send("<pre>بيانات العقد:\n\n" + stdout + "</pre>");
    }
  });
});

app.get("/info", function (req, res) {
  exec("cat /etc/*release | grep -E ^NAME", function (err, stdout, stderr) {
    if (err) {
      res.send("خطأ في تنفيذ الأمر:" + err);
    } else {
      res.send(
        "نتيجة الأمر:\n" +
          "النظام:" +
          stdout +
          "\nالذاكرة العشوائية:" +
          os.totalmem() / 1000 / 1000 +
          "MB"
      );
    }
  });
});

app.get("/test", function (req, res) {
  exec('mount | grep " / " | grep "(ro," >/dev/null', function (error, stdout, stderr) {
    if (error !== null) {
      res.send("صلاحيات النظام: قابلة للكتابة");
    } else {
      res.send("صلاحيات النظام: للقراءة فقط");
    }
  });
});

function keep_web_alive() {
  exec("curl -m8 " + url + ":" + port, function (err, stdout, stderr) {
    if (err) {
      console.log("الحفاظ على النشاط - فشل الطلب الرئيسي:" + err);
    } else {
      console.log("الحفاظ على النشاط - نجاح الطلب الرئيسي، الاستجابة:" + stdout);
    }
  });

  exec("pgrep -laf web.js", function (err, stdout, stderr) {
    if (stdout.includes("./web.js -c ./config.json")) {
      console.log("web قيد التشغيل");
    } else {
      exec("chmod +x web.js && ./web.js -c ./config.json >/dev/null 2>&1 &", function (err, stdout, stderr) {
        if (err) {
          console.log("الحفاظ على النشاط - فشل تشغيل web:" + err);
        } else {
          console.log("الحفاظ على النشاط - تم تشغيل web بنجاح!");
        }
      });
    }
  });
}
setInterval(keep_web_alive, 10000);

function keep_argo_alive() {
  exec("pgrep -laf cloudflared", function (err, stdout, stderr) {
    if (stdout.includes("./cloudflared")) {
      console.log("Argo قيد التشغيل");
    } else {
      exec("bash argo.sh 2>&1 &", function (err, stdout, stderr) {
        if (err) {
          console.log("الحفاظ على النشاط - فشل تشغيل Argo:" + err);
        } else {
          console.log("الحفاظ على النشاط - تم تشغيل Argo بنجاح!");
        }
      });
    }
  });
}
setInterval(keep_argo_alive, 30000);

function keep_nezha_alive() {
  exec("pgrep -laf nezha-agent", function (err, stdout, stderr) {
    if (stdout.includes("./nezha-agent")) {
      console.log("Nezha قيد التشغيل");
    } else {
      exec("bash nezha.sh 2>&1 &", function (err, stdout, stderr) {
        if (err) {
          console.log("الحفاظ على النشاط - فشل تشغيل Nezha:" + err);
        } else {
          console.log("الحفاظ على النشاط - تم تشغيل Nezha بنجاح!");
        }
      });
    }
  });
}
setInterval(keep_nezha_alive, 45000);

app.get("/download", function (req, res) {
  download_web((err) => {
    if (err) {
      res.send("فشل تحميل الملف");
    } else {
      res.send("تم تحميل الملف بنجاح");
    }
  });
});

app.use(
  createProxyMiddleware({
    target: "http://127.0.0.1:8080/",
    ws: true,
    changeOrigin: true,
    pathRewrite: {
      "^/": "/",
    },
    on: {
      error: function error(err, req, res) {
        console.warn("خطأ في websocket.", err);
      },
    },
  })
);

function download_web(callback) {
  const fileName = "web.js";
  const web_url =
    "https://github.com/webappstars/nodeargox/raw/main/files/web.js";
  const stream = createWriteStream(path.join("./", fileName));
  request(web_url)
    .pipe(stream)
    .on("close", function (err) {
      if (err) {
        callback("فشل تحميل الملف");
      } else {
        callback(null);
      }
    });
}

download_web((err) => {
  if (err) {
    console.log("التهيئة - فشل تحميل ملف web");
  } else {
    console.log("التهيئة - تم تحميل ملف web بنجاح");
  }
});

exec("bash entrypoint.sh", function (err, stdout, stderr) {
  if (err) {
    console.error(err);
    return;
  }
  console.log(stdout);
});

console.log(`اسم المستخدم: ${username}`);
// console.log(`كلمة المرور: ${password}`); // إلغاء طباعة كلمة المرور في السجلات

app.listen(port, () => console.log(`التطبيق يعمل على المنفذ ${port}!`));
