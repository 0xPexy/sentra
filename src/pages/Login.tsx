import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

export default function Login() {
  const nav = useNavigate();
  const { setToken } = useAuth();
  const [username, setU] = useState(""); 
  const [password, setP] = useState("");
  const [err, setErr] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      const { token } = await api.login(username, password);
      setToken(token);
      nav("/");
    } catch (e: any) { setErr(e.message || "Login failed"); }
  };

  return (
    <div className="min-h-screen bg-[#0A0E17] flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="surface-card w-full max-w-sm p-6 space-y-4">
        <h1 className="text-xl font-semibold mb-4">Sentra Admin</h1>
        <label className="block mb-2 text-sm">Username</label>
        <input className="w-full mb-3 px-3 py-2 rounded bg-slate-900 border border-slate-700 outline-none"
               value={username} onChange={(e)=>setU(e.target.value)} />
        <label className="block mb-2 text-sm">Password</label>
        <input type="password" className="w-full mb-4 px-3 py-2 rounded bg-slate-900 border border-slate-700 outline-none"
               value={password} onChange={(e)=>setP(e.target.value)} />
        {err && <div className="text-red-400 text-sm mb-2">{err}</div>}
        <button className="btn-primary w-full">Login</button>
      </form>
    </div>
  );
}
