import { useEffect, useState } from "react";
import { ConfigProvider, Spin } from "antd";
import zhCN from "antd/locale/zh_CN";
import { api, clearToken, getToken } from "./api";
import Login from "./pages/Login";
import Shell from "./components/Shell";

export default function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [checking, setChecking] = useState(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) {
      setChecking(false);
      return;
    }
    api
      .me()
      .then(() => setAuthed(true))
      .catch(() => {
        clearToken();
        setAuthed(false);
      })
      .finally(() => setChecking(false));
  }, []);

  return (
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: "#2f6be4", borderRadius: 10 } }}>
      {checking ? (
        <div className="boot">
          <Spin size="large" />
        </div>
      ) : authed ? (
        <Shell
          onLogout={() => {
            clearToken();
            setAuthed(false);
          }}
        />
      ) : (
        <Login onSuccess={() => setAuthed(true)} />
      )}
    </ConfigProvider>
  );
}
