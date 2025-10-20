"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, Plus, Trash2, Filter } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis, Cell,
} from "recharts";

// Helpers
const peso = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(Number(n || 0));

const uid = () => Math.random().toString(36).slice(2, 10);
const STORAGE_KEY = "family_finance_app_v1";

const DEFAULT_CATEGORIES = [
  "Renta","CFE (Luz)","Agua","Gas","Internet/Telefonía","Super/Despensa",
  "Gasolina","Auto: Mantenimiento","Auto: Seguro","Transporte/App",
  "Escuelas/Colegiaturas","Médicos/Medicinas","Entretenimiento","Restaurantes",
  "Vivienda: Mantenimiento","Mascotas","Viajes","Ropa/Calzado","Hogar/Artículos",
  "Impuestos","Servicios Profesionales","Suscripciones","Otros",
];

const DEFAULT_METHODS = [
  "Efectivo","Tarjeta débito","Tarjeta crédito: Visa","Tarjeta crédito: Mastercard",
  "Tarjeta crédito: AMEX","Transferencia","Cheque","Vales","Otro",
];

function useLocalState<T>(initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return (saved ?? initial) as T;
    } catch { return initial; }
  });
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);
  return [state, setState] as const;
}

function monthKey(d: string | Date) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

function csvExport(transactions: any[]) {
  const header = ["id","fecha","tipo","categoria","monto","metodo","nota"];
  const rows = transactions.map((t) => [
    t.id, t.date, t.type, t.category, t.amount, t.method, String(t.notes || "").replaceAll("\n", " "),
  ]);
  const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `finanzas-familia-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function csvImport(text: string) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift()!.split(",").map((s) => s.replace(/^\"|\"$/g, ""));
  const idx: Record<string, number> = Object.fromEntries(header.map((h,i)=>[h,i]));
  const items = lines.map((line) => {
    const cells = line.match(/\"(?:[^\"]|\"\")*\"/g)?.map((s)=>s.slice(1,-1).replaceAll('""','"')) || [];
    return {
      id: cells[idx.id] || uid(),
      date: cells[idx.fecha] || new Date().toISOString().slice(0,10),
      type: (cells[idx.tipo] as "gasto"|"ingreso") || "gasto",
      category: cells[idx.categoria] || "Otros",
      amount: Number(cells[idx.monto] || 0),
      method: cells[idx.metodo] || "Efectivo",
      notes: cells[idx.nota] || "",
    };
  });
  return items;
}

export default function Page() {
  const [data, setData] = useLocalState({
    categories: DEFAULT_CATEGORIES,
    methods: DEFAULT_METHODS,
    transactions: [] as any[],
  });

  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`;

  const [activeMonth, setActiveMonth] = useState(defaultMonth);
  const [type, setType] = useState<"gasto"|"ingreso">("gasto");
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0,10),
    category: "Super/Despensa",
    amount: "",
    method: "Tarjeta crédito: Visa",
    notes: "",
  });
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement|null>(null);

  const filtered = useMemo(() =>
    data.transactions
      .filter(t => monthKey(t.date) === activeMonth)
      .filter(t => !search || JSON.stringify(t).toLowerCase().includes(search.toLowerCase()))
      .sort((a,b)=> +new Date(b.date) - +new Date(a.date)),
    [data.transactions, activeMonth, search]
  );

  const summary = useMemo(() => {
    const income  = filtered.filter(t=>t.type==='ingreso').reduce((s,t)=>s+Number(t.amount||0),0);
    const expense = filtered.filter(t=>t.type==='gasto').reduce((s,t)=>s+Number(t.amount||0),0);
    const byCategory = Object.values(filtered.reduce((acc:any,t:any)=>{
      const k=t.category; acc[k]=acc[k]||{categoria:k,gasto:0,ingreso:0};
      acc[k][t.type==='gasto'?'gasto':'ingreso']+=Number(t.amount||0); return acc;
    },{} as Record<string,any>)).sort((a:any,b:any)=> (b.gasto+b.ingreso)-(a.gasto+a.ingreso));
    const byMethod = Object.values(filtered.reduce((acc:any,t:any)=>{
      const k=t.method; acc[k]=acc[k]||{metodo:k,total:0};
      acc[k].total += t.type==='gasto'?Number(t.amount||0):0; return acc;
    },{} as Record<string,any>)).sort((a:any,b:any)=> b.total-a.total);
    return { income, expense, cashflow: income-expense, byCategory, byMethod };
  }, [filtered]);

  function addTransaction() {
    if (!form.amount || !form.date) return;
    const tx = { id: uid(), date: form.date, type, category: form.category, amount: Number(form.amount), method: form.method, notes: form.notes?.trim() || "" };
    setData(d => ({...d, transactions: [tx, ...d.transactions]}));
    setForm({...form, amount: "", notes: ""});
  }
  const removeTransaction = (id:string) =>
    setData(d=> ({...d, transactions: d.transactions.filter(t=>t.id!==id)}));
  const addCategory = (name:string) =>
    name && setData(d=> ({...d, categories: Array.from(new Set([...d.categories, name]))}));
  const addMethod = (name:string) =>
    name && setData(d=> ({...d, methods: Array.from(new Set([...d.methods, name]))}));

  function handleImport(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const items = csvImport(String(e.target?.result || ""));
        setData(d=> ({...d, transactions: [...items, ...d.transactions]}));
      } catch { alert("Archivo CSV no válido"); }
    };
    reader.readAsText(file);
  }

  const monthLabel = useMemo(() => {
    const [y,m] = activeMonth.split("-").map(Number);
    const dt = new Date(y, m-1, 1);
    return dt.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  }, [activeMonth]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-white p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Finanzas Familiares</h1>
            <p className="text-sm text-slate-600">Control de ingresos, gastos, métodos de pago y categorías. Datos guardados en tu navegador.</p>
          </div>
          <div className="flex items-center gap-2">
            <Input type="month" value={activeMonth} onChange={(e)=> setActiveMonth(e.target.value)} className="w-44" aria-label="Mes activo"/>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={()=> csvExport(data.transactions)} title="Exportar CSV"><Download className="mr-2 h-4 w-4"/> Exportar</Button>
              <Button variant="outline" onClick={()=> fileRef.current?.click()} title="Importar CSV"><Upload className="mr-2 h-4 w-4"/> Importar</Button>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e)=> e.target.files?.[0] && handleImport(e.target.files[0])}/>
            </div>
          </div>
        </header>

        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-2xl"><CardHeader className="pb-2"><CardTitle className="text-base text-slate-500">Ingresos del mes</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{peso(summary.income)}</div></CardContent></Card>
          <Card className="rounded-2xl"><CardHeader className="pb-2"><CardTitle className="text-base text-slate-500">Gastos del mes</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{peso(summary.expense)}</div></CardContent></Card>
          <Card className="rounded-2xl"><CardHeader className="pb-2"><CardTitle className="text-base text-slate-500">Flujo (Ingresos − Gastos)</CardTitle></CardHeader><CardContent><div className={`text-3xl font-semibold ${summary.cashflow>=0?"text-emerald-600":"text-rose-600"}`}>{peso(summary.cashflow)}</div></CardContent></Card>
        </div>

        {/* Form */}
        <Card className="rounded-2xl">
          <CardHeader><CardTitle>Agregar movimiento</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-12">
            <div className="md:col-span-2">
              <Label className="mb-1 block">Tipo</Label>
              <Tabs value={type} onValueChange={(v:any)=> setType(v)} className="w-full">
                <TabsList className="grid grid-cols-2">
                  <TabsTrigger value="ingreso">Ingreso</TabsTrigger>
                  <TabsTrigger value="gasto">Gasto</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="md:col-span-2">
              <Label className="mb-1 block">Fecha</Label>
              <Input type="date" value={form.date} onChange={(e)=> setForm(f=>({...f, date:e.target.value}))}/>
            </div>
            <div className="md:col-span-3">
              <Label className="mb-1 block">Categoría</Label>
              <div className="flex gap-2">
                <Select value={form.category} onValueChange={(v)=> setForm(f=>({...f, category:v}))}>
                  <SelectTrigger><SelectValue placeholder="Selecciona"/></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {data.categories.map((c)=> (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                  </SelectContent>
                </Select>
                <AddItemDialog label="Nueva" onAdd={addCategory} placeholder="p.ej. Guardería"/>
              </div>
            </div>
            <div className="md:col-span-2">
              <Label className="mb-1 block">Monto (MXN)</Label>
              <Input inputMode="decimal" value={form.amount} onChange={(e)=> setForm(f=>({...f, amount:e.target.value.replace(/[^0-9.]/g,"")}))} placeholder="0.00"/>
            </div>
            <div className="md:col-span-3">
              <Label className="mb-1 block">Método de pago</Label>
              <div className="flex gap-2">
                <Select value={form.method} onValueChange={(v)=> setForm(f=>({...f, method:v}))}>
                  <SelectTrigger><SelectValue placeholder="Selecciona"/></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {data.methods.map((m)=> (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                  </SelectContent>
                </Select>
                <AddItemDialog label="Nuevo" onAdd={addMethod} placeholder="p.ej. Tarjeta crédito: BBVA Visa"/>
              </div>
            </div>
            <div className="md:col-span-12">
              <Label className="mb-1 block">Notas (opcional)</Label>
              <Input value={form.notes} onChange={(e)=> setForm(f=>({...f, notes:e.target.value}))} placeholder="Descripción, folio, quién pagó, etc."/>
            </div>
            <div className="md:col-span-12 flex justify-end">
              <Button onClick={addTransaction} className="rounded-2xl"><Plus className="mr-2 h-4 w-4"/> Agregar</Button>
            </div>
          </CardContent>
        </Card>

        {/* Movimientos */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle>Movimientos de {monthLabel}</CardTitle>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500"/>
              <Input value={search} onChange={(e)=> setSearch(e.target.value)} placeholder="Buscar (categoría, método, notas, monto)" className="w-72"/>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-slate-500">Sin movimientos en este mes</TableCell></TableRow>
                )}
                {filtered.map((t)=> (
                  <TableRow key={t.id}>
                    <TableCell>{new Date(t.date).toLocaleDateString("es-MX")}</TableCell>
                    <TableCell>
                      <Badge variant={t.type==='ingreso'?"default":"secondary"} className={t.type==='ingreso'?"bg-emerald-600":"bg-slate-200 text-slate-800"}>
                        {t.type === 'ingreso' ? 'Ingreso' : 'Gasto'}
                      </Badge>
                    </TableCell>
                    <TableCell>{t.category}</TableCell>
                    <TableCell>{t.method}</TableCell>
                    <TableCell className={`text-right ${t.type==='ingreso'?'text-emerald-600':'text-rose-600'}`}>{peso(t.amount)}</TableCell>
                    <TableCell className="max-w-[280px] truncate" title={t.notes}>{t.notes}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={()=> removeTransaction(t.id)} title="Eliminar"><Trash2 className="h-4 w-4"/></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableCaption>Total registros: {filtered.length}</TableCaption>
            </Table>
          </CardContent>
        </Card>

        {/* Gráficas */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="rounded-2xl">
            <CardHeader><CardTitle>Gasto por categoría</CardTitle></CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.byCategory as any[]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="categoria" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={60}/>
                  <YAxis />
                  <Tooltip formatter={(v:any)=> peso(Number(v))} />
                  <Legend />
                  <Bar dataKey="gasto" name="Gasto" />
                  <Bar dataKey="ingreso" name="Ingreso" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardHeader><CardTitle>Uso de métodos de pago (gasto)</CardTitle></CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip formatter={(v:any)=> peso(Number(v))} />
                  <Legend />
                  <Pie data={summary.byMethod as any[]} dataKey="total" nameKey="metodo" outerRadius={110}
                       label={({name, percent}:any)=> `${name} ${(percent*100).toFixed(0)}%`}>
                    {(summary.byMethod as any[]).map((_, i) => (<Cell key={i} />))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Resumen por categoría */}
        <Card className="rounded-2xl">
          <CardHeader><CardTitle>Resumen por categoría – {monthLabel}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="text-right">Ingreso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary.byCategory as any[]).map((row) => (
                  <TableRow key={row.categoria}>
                    <TableCell className="font-medium">{row.categoria}</TableCell>
                    <TableCell className="text-right text-rose-600">{peso(row.gasto)}</TableCell>
                    <TableCell className="text-right text-emerald-600">{peso(row.ingreso)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-semibold">{peso(summary.expense)}</TableCell>
                  <TableCell className="text-right font-semibold">{peso(summary.income)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <footer className="text-center text-xs text-slate-500 py-4">
          Hecho con ❤️ para controlar las finanzas familiares. Tu información se guarda localmente (localStorage).
        </footer>
      </div>
    </div>
  );
}

function AddItemDialog({ label = "Nuevo", onAdd, placeholder = "Nombre" }:{
  label?: string; onAdd?: (name: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" type="button">{label}</Button></DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Agregar elemento</DialogTitle>
          <DialogDescription>Escribe el nombre y guarda.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">Nombre</Label>
            <Input id="name" value={value} onChange={(e)=> setValue(e.target.value)} className="col-span-3" placeholder={placeholder}/>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={()=> { onAdd?.(value.trim()); setValue(""); setOpen(false); }}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
