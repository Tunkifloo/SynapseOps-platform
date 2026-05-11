import { useAppStore } from './store/useAppStore';
import { 
  Database, Cpu, Split, Brain, Rocket, User as UserIcon, Search, Bell,
  Activity, Zap, Box, Layers, 
  type LucideIcon 
} from 'lucide-react';

// Shadcn UI Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Definimos una interfaz para las props de la tarjeta para eliminar el error de 'any'
interface StatCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  color: string;
}

function App() {
  const user = useAppStore((state) => state.user);
  const workspace = useAppStore((state) => state.currentWorkspace);

  const components = [
    { name: 'Data Ingestion', icon: Database, color: 'text-emerald-400' },
    { name: 'Preprocessing', icon: Cpu, color: 'text-blue-400' },
    { name: 'Dataset Split', icon: Split, color: 'text-orange-400' },
    { name: 'Model Training', icon: Brain, color: 'text-purple-400' },
    { name: 'Model Deployment', icon: Rocket, color: 'text-amber-400' },
  ];

  return (
    <div className="flex h-screen w-full bg-[#050505] text-slate-400 font-sans selection:bg-blue-500/30 overflow-hidden">
      
      {/* SIDEBAR */}
      <aside className="w-64 border-r border-white/5 bg-[#0a0a0a] p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3 mb-10 px-2">
            <div className="w-8 h-8 bg-gradient-to-tr from-blue-600 to-emerald-400 rounded-lg shadow-lg shadow-blue-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight italic">Synapse<span className="text-blue-500">Ops</span></h2>
          </div>
          
          <nav className="space-y-1">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.2em] px-2 mb-4">Pipeline Core</p>
            {components.map((item) => (
              <Button 
                key={item.name} 
                variant="ghost" 
                className="w-full justify-start text-slate-400 hover:text-white hover:bg-white/5 rounded-xl px-2 group transition-all"
              >
                <item.icon className={`w-4 h-4 mr-3 ${item.color} group-hover:scale-110 transition-transform`} />
                <span className="text-xs font-medium">{item.name}</span>
              </Button>
            ))}
          </nav>
        </div>

        <div className="p-4 bg-gradient-to-tr from-blue-600/10 to-emerald-500/5 border border-white/5 rounded-2xl backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <p className="text-[10px] text-emerald-400 font-bold uppercase">System Live</p>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed font-mono">Latency: 24ms<br/>Uptime: 99.9%</p>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col relative">
        
        {/* HEADER */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-[#050505]/60 backdrop-blur-md sticky top-0 z-50">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 z-10" />
              <Input 
                placeholder="Search nodes..." 
                className="bg-white/5 border-white/10 rounded-full pl-10 text-xs focus-visible:ring-blue-500/50"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <Button variant="ghost" size="icon" className="text-slate-500 hover:text-white">
              <Bell className="w-5 h-5" />
            </Button>
            <div className="h-6 w-px bg-white/10"></div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs font-bold text-white">{user?.name}</p>
                <p className="text-[10px] text-slate-500 font-medium tracking-tighter uppercase">{user?.role} • Online</p>
              </div>
              <div className="w-10 h-10 rounded-xl border border-white/10 p-0.5 bg-gradient-to-br from-blue-500/20 to-transparent">
                <div className="w-full h-full rounded-[10px] bg-slate-900 flex items-center justify-center">
                  <UserIcon className="w-5 h-5 text-blue-400" />
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* WORKSPACE AREA */}
        <main className="flex-1 relative bg-[#050505] overflow-hidden p-8">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px]"></div>
          
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatCard title="Active Workspaces" value="12" icon={Layers} color="text-blue-500" />
            <StatCard title="Total Models" value="48" icon={Box} color="text-emerald-500" />
            <StatCard title="Requests/sec" value="1.2k" icon={Activity} color="text-orange-500" />
          </div>

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <h3 className="text-white/10 font-black text-8xl tracking-tighter mb-2 select-none">SYNAPSE</h3>
              {/* Aquí usamos la variable 'workspace' para eliminar el error de ESLint */}
              <p className="text-[10px] text-slate-600 uppercase tracking-[0.8em]">Workspace: {workspace}</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// Componente StatCard con tipado estricto para eliminar el error de 'any'
function StatCard({ title, value, icon: Icon, color }: StatCardProps) {
  return (
    <Card className="bg-white/[0.03] border-white/5 backdrop-blur-xl hover:bg-white/[0.05] transition-all">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{title}</CardTitle>
        <Icon className={`w-4 h-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
        <p className="text-[10px] text-emerald-500 mt-1 flex items-center gap-1">
          <span>+12.5%</span> <span className="text-slate-600">from last cycle</span>
        </p>
      </CardContent>
    </Card>
  );
}

export default App;