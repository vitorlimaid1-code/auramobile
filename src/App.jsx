import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithCustomToken, 
  signInAnonymously, 
  onAuthStateChanged, 
  signOut, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  arrayUnion,
  arrayRemove,
  serverTimestamp
} from 'firebase/firestore';
import { 
  Heart, Camera, Send, MessageCircle, User, Settings, Search, 
  Bell, Menu, X, Plus, Image as ImageIcon, CheckCircle, 
  Star, Shield, LogOut, TrendingUp, Hash, ArrowLeft, 
  ArrowRight, Globe, Lock, Unlock, Flag, Trash2, Edit3, 
  CreditCard, Smartphone, Mail, Eye, Share2, Download, 
  Moon, Sun, Sparkles, LayoutGrid, Clock, Filter, BarChart3,
  DollarSign, ShieldAlert, BadgeCheck, Zap, Repeat, MessageSquare,
  MoreHorizontal, ChevronRight, UserPlus, ShieldCheck, CreditCard as CardIcon,
  Instagram, Twitter, Github
} from 'lucide-react';

// --- INITIALIZATION ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'auraheart-v2';

// --- CONSTANTS ---
const ADMIN_EMAIL = "admin@auraheart.com";
const CATEGORIES = [
  "Fotos", "Amor", "Casais", "Tatuagens", "Carros", "IA", "Papel de parede", 
  "Patterns", "Decoração", "Moda", "Homens", "Mulheres", "Comida", "Locais", 
  "Objetos", "Desenhos", "Animes", "Arquitetura", "Design"
];

const COLORS = {
  primary: '#ffb6c1',
  secondary: '#d63384',
  gold: '#FFD700',
  blue: '#3b82f6'
};

// --- HELPER FOR EXPONENTIAL BACKOFF ---
const fetchWithRetry = async (fn, retries = 5, delay = 1000) => {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise(resolve => setTimeout(resolve, delay));
    return fetchWithRetry(fn, retries - 1, delay * 2);
  }
};

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [view, setView] = useState('home');
  const [activeProfile, setActiveProfile] = useState(null);
  const [activePost, setActivePost] = useState(null);
  const [posts, setPosts] = useState([]);
  const [pulsePosts, setPulsePosts] = useState([]);
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNotification, setShowNotification] = useState(null);

  // --- AUTH LOGIC ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth init failed", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', u.uid);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          setUserData(userDoc.data());
        } else if (!u.isAnonymous || u.email === ADMIN_EMAIL) {
          // Initialize user if they are logged in and don't have a doc
          const newUser = {
            uid: u.uid,
            email: u.email || '',
            username: u.email ? u.email.split('@')[0] : `user_${u.uid.slice(0, 5)}`,
            bio: "Bem-vindo à AuraHeart!",
            photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.uid}`,
            coverURL: "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?q=80&w=2000",
            badges: u.email === ADMIN_EMAIL ? ['verified', 'trendsetter'] : [],
            followers: [],
            following: [ADMIN_EMAIL],
            interests: [],
            isBanned: false,
            createdAt: Date.now()
          };
          await setDoc(userRef, newUser);
          setUserData(newUser);
        }
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // --- REAL-TIME DATA LOGIC ---
  useEffect(() => {
    if (!user) return;

    const collections = [
      { name: 'posts', setter: setPosts },
      { name: 'pulse', setter: setPulsePosts },
      { name: 'users', setter: setUsers },
      { name: 'reports', setter: setReports }
    ];

    const unsubscribes = collections.map(col => {
      const q = collection(db, 'artifacts', appId, 'public', 'data', col.name);
      return onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        col.setter(data);
      }, (err) => console.error(`Error on ${col.name}`, err));
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [user]);

  // --- CHAT LOGIC ---
  useEffect(() => {
    if (!user || !activeChatId) return;
    const q = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'chats', activeChatId, 'messages'),
      orderBy('timestamp', 'asc'),
      limit(50)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user, activeChatId]);

  // --- ACTIONS ---
  const triggerToast = (msg, type = 'success') => {
    setShowNotification({ msg, type });
    setTimeout(() => setShowNotification(null), 3000);
  };

  const handleHeart = async (postId) => {
    if (!user || user.isAnonymous || userData?.isBanned) {
      triggerToast("Faz login para curtir!", "error");
      return;
    }
    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'posts', postId);
    const post = posts.find(p => p.id === postId);
    const hasHearted = post?.hearts?.includes(user.uid);

    await updateDoc(postRef, {
      hearts: hasHearted ? arrayRemove(user.uid) : arrayUnion(user.uid)
    });
    triggerToast(hasHearted ? "Removido" : "Inspirado!", "success");
  };

  const handleFollow = async (targetUid) => {
    if (!user || user.isAnonymous || targetUid === user.uid) return;
    if (targetUid === ADMIN_EMAIL && userData?.following?.includes(ADMIN_EMAIL)) {
      triggerToast("Não podes deixar de seguir o canal oficial", "error");
      return;
    }

    const myRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid);
    const targetRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', targetUid);
    const isFollowing = userData?.following?.includes(targetUid);

    await updateDoc(myRef, { following: isFollowing ? arrayRemove(targetUid) : arrayUnion(targetUid) });
    await updateDoc(targetRef, { followers: isFollowing ? arrayRemove(user.uid) : arrayUnion(user.uid) });
    
    triggerToast(isFollowing ? "Deixaste de seguir" : "A seguir agora!");
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newPost = {
      userId: user.uid,
      image: formData.get('url'),
      title: formData.get('title'),
      description: formData.get('description'),
      tags: formData.get('tags').split(',').map(t => t.trim()),
      hearts: [],
      createdAt: Date.now()
    };
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'posts'), newPost);
    setView('home');
    triggerToast("Pin publicado com sucesso!");
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    const text = e.target.msg.value;
    if (!text || !activeChatId) return;
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'chats', activeChatId, 'messages'), {
      senderId: user.uid,
      text,
      timestamp: serverTimestamp()
    });
    e.target.reset();
  };

  const isAdmin = userData?.email === ADMIN_EMAIL;

  // --- SUB-COMPONENTS ---

  const Navbar = () => (
    <nav className={`fixed top-0 w-full z-[200] transition-all border-b ${darkMode ? 'bg-zinc-950 border-zinc-900 text-white' : 'bg-white/80 backdrop-blur-md border-pink-50'}`}>
      <div className="max-w-[1900px] mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <h1 onClick={() => setView('home')} className="text-2xl font-bold cursor-pointer flex items-center gap-2 select-none text-pink-500 font-serif">
            <Heart fill="#ffb6c1" size={24} /> AuraHeart
          </h1>
          <div className="hidden lg:flex gap-6 text-[10px] font-black uppercase tracking-widest text-zinc-400">
            <button onClick={() => setView('home')} className={view === 'home' ? 'text-pink-500' : ''}>Descobrir</button>
            <button onClick={() => setView('pulse')} className={view === 'pulse' ? 'text-pink-500' : ''}>Pulse</button>
          </div>
        </div>

        <div className="flex-1 max-w-lg mx-8 relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-300" size={16} />
          <input 
            type="text" 
            placeholder="Procurar inspiração..." 
            className="w-full pl-10 pr-4 py-2 bg-pink-50/50 rounded-full border-none focus:ring-2 focus:ring-pink-100 text-sm"
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-4">
          <button onClick={() => setDarkMode(!darkMode)} className="p-2 hover:bg-zinc-100 rounded-full">
            {darkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-zinc-400" />}
          </button>
          {user && !user.isAnonymous ? (
            <>
              <button onClick={() => setView('chat')} className="p-2 hover:bg-zinc-100 rounded-full text-zinc-400 hover:text-pink-500"><MessageCircle size={22} /></button>
              <div 
                onClick={() => { setActiveProfile(userData); setView('profile'); }}
                className="w-9 h-9 rounded-full overflow-hidden cursor-pointer border-2 border-pink-200"
              >
                <img src={userData?.photoURL} className="w-full h-full object-cover" />
              </div>
              {isAdmin && (
                <button onClick={() => setView('admin')} className="hidden md:block bg-zinc-950 text-white px-4 py-1.5 rounded-lg text-[10px] font-black tracking-widest uppercase shadow-lg">Admin</button>
              )}
            </>
          ) : (
            <button onClick={() => setView('auth')} className="bg-pink-500 text-white px-6 py-2 rounded-full font-black text-xs uppercase shadow-lg">Entrar</button>
          )}
        </div>
      </div>
    </nav>
  );

  const PostCard = ({ post }) => {
    const author = users.find(u => u.uid === post.userId);
    const hasHearted = post.hearts?.includes(user?.uid);

    return (
      <div className="group relative break-inside-avoid mb-6 rounded-[2.5rem] overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-500 bg-white">
        <div className="relative cursor-pointer" onClick={() => { setActivePost(post); setView('details'); }}>
          <img src={post.image} className="w-full h-auto object-cover transform group-hover:scale-105 transition-transform duration-700" loading="lazy" />
          <div className="absolute inset-0 bg-pink-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
            <Heart size={80} fill="white" className="text-white drop-shadow-2xl transform scale-0 group-hover:scale-100 transition-all duration-500" />
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); handleHeart(post.id); }}
            className={`absolute top-4 right-4 p-3 rounded-full shadow-lg ${hasHearted ? 'bg-pink-500 text-white' : 'bg-white/90 text-pink-500 hover:bg-white'}`}
          >
            <Heart size={16} fill={hasHearted ? 'white' : 'none'} />
          </button>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setActiveProfile(author); setView('profile'); }}>
              <img src={author?.photoURL} className="w-8 h-8 rounded-full border border-pink-50" />
              <div className="flex flex-col">
                <span className="text-[10px] font-black flex items-center gap-1">{author?.username} {author?.badges?.includes('verified') && <BadgeCheck size={12} className="text-blue-500" />}</span>
                <span className="text-[8px] text-zinc-300 font-bold uppercase tracking-widest">Seguir</span>
              </div>
            </div>
            <Download size={16} className="text-zinc-300 hover:text-pink-500 cursor-pointer" />
          </div>
          <p className="text-sm font-bold truncate leading-tight">{post.title}</p>
        </div>
      </div>
    );
  };

  const AdminPanel = () => {
    const [tab, setTab] = useState('users');
    
    const updateBadge = async (uid, badge) => {
      const u = users.find(x => x.uid === uid);
      const badges = u.badges || [];
      const newBadges = badges.includes(badge) ? badges.filter(b => b !== badge) : [...badges, badge];
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', uid), { badges: newBadges });
    };

    const deleteContent = async (col, id) => {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', col, id));
      triggerToast("Conteúdo removido.");
    };

    return (
      <div className="pt-24 px-4 md:px-8 max-w-7xl mx-auto min-h-screen pb-20">
        <header className="mb-8 flex items-end justify-between">
          <div>
             <h2 className="text-3xl font-serif font-bold">Consola AuraHeart</h2>
             <p className="text-zinc-400 text-sm">Controlo total da plataforma e segurança da comunidade.</p>
          </div>
          <div className="flex gap-4">
             <div className="p-4 bg-zinc-100 rounded-2xl text-center"><p className="text-[10px] font-black opacity-50 uppercase">Membros</p><p className="text-xl font-bold">{users.length}</p></div>
             <div className="p-4 bg-red-100 rounded-2xl text-center"><p className="text-[10px] font-black text-red-500 uppercase">Alertas</p><p className="text-xl font-bold text-red-600">{reports.length}</p></div>
          </div>
        </header>

        <div className="flex flex-col lg:flex-row gap-8">
           <aside className="lg:w-64 space-y-2">
              {['users', 'posts', 'reports'].map(t => (
                <button 
                  key={t}
                  onClick={() => setTab(t)}
                  className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${tab === t ? 'bg-pink-500 text-white shadow-xl' : 'hover:bg-zinc-100 text-zinc-400'}`}
                >
                  {t === 'users' ? <User size={18}/> : t === 'posts' ? <ImageIcon size={18}/> : <ShieldAlert size={18}/>}
                  {t}
                </button>
              ))}
           </aside>

           <main className="flex-1 bg-white rounded-[40px] shadow-sm border border-zinc-50 p-6 md:p-10 overflow-x-auto">
              {tab === 'users' && (
                <table className="w-full text-left min-w-[600px]">
                  <thead>
                    <tr className="border-b text-[10px] font-black text-zinc-300 uppercase"><th className="pb-4">Membro</th><th className="pb-4">Selos</th><th className="pb-4 text-right">Controlo</th></tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {users.map(u => (
                      <tr key={u.uid} className="group">
                        <td className="py-4 flex items-center gap-3">
                          <img src={u.photoURL} className="w-10 h-10 rounded-full" />
                          <div><p className="font-black text-sm">{u.username}</p><p className="text-xs text-zinc-300">{u.email}</p></div>
                        </td>
                        <td className="py-4">
                           <div className="flex gap-2">
                              <button onClick={() => updateBadge(u.uid, 'verified')} className={`p-2 rounded-lg ${u.badges?.includes('verified') ? 'bg-blue-500 text-white' : 'bg-zinc-50 text-zinc-300'}`}><BadgeCheck size={18}/></button>
                              <button onClick={() => updateBadge(u.uid, 'trendsetter')} className={`p-2 rounded-lg ${u.badges?.includes('trendsetter') ? 'bg-yellow-400 text-white' : 'bg-zinc-50 text-zinc-300'}`}><Star size={18} fill="currentColor"/></button>
                           </div>
                        </td>
                        <td className="py-4 text-right">
                           <button onClick={() => deleteContent('users', u.id)} className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"><Trash2 size={18}/></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {tab === 'posts' && (
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {posts.map(p => (
                      <div key={p.id} className="relative group rounded-xl overflow-hidden aspect-square border">
                        <img src={p.image} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                           <button onClick={() => deleteContent('posts', p.id)} className="p-3 bg-red-500 text-white rounded-full"><Trash2 size={16}/></button>
                        </div>
                      </div>
                    ))}
                 </div>
              )}
           </main>
        </div>
      </div>
    );
  };

  const PulseTimeline = () => {
    const [msg, setMsg] = useState('');
    const handlePulse = async (e) => {
      e.preventDefault();
      if (!msg.trim()) return;
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'pulse'), {
        userId: user.uid,
        content: msg,
        hearts: [],
        createdAt: Date.now()
      });
      setMsg('');
      triggerToast("Pulse enviado!");
    };

    return (
      <div className="pt-24 max-w-2xl mx-auto px-4 pb-20">
        <form onSubmit={handlePulse} className={`p-6 md:p-8 rounded-[30px] shadow-xl mb-10 border-2 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-pink-50'}`}>
           <textarea 
            placeholder="O que te faz o coração bater?" 
            className="w-full bg-transparent border-none resize-none text-xl font-medium focus:ring-0 mb-4 h-24"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            name="pulse"
           />
           <div className="flex justify-between items-center border-t border-zinc-50 pt-4">
              <div className="flex gap-2 text-pink-400"><ImageIcon size={20}/><Sparkles size={20}/></div>
              <button className="bg-zinc-950 text-white px-8 py-2 rounded-full font-black text-[10px] uppercase shadow-lg">Publicar</button>
           </div>
        </form>

        <div className="space-y-6">
           {pulsePosts.sort((a,b) => b.createdAt - a.createdAt).map(p => {
             const author = users.find(u => u.uid === p.userId);
             return (
               <div key={p.id} className="p-8 bg-white rounded-[40px] shadow-sm border border-zinc-50 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <div className="flex items-center gap-4 mb-6">
                     <img src={author?.photoURL} className="w-12 h-12 rounded-2xl border shadow-sm" />
                     <div><h4 className="font-black text-lg flex items-center gap-1">{author?.username} {author?.badges?.includes('verified') && <BadgeCheck size={16} className="text-blue-500" />}</h4><p className="text-[10px] text-zinc-300 font-bold uppercase">{new Date(p.createdAt).toLocaleDateString()}</p></div>
                  </div>
                  <p className="text-xl text-zinc-700 leading-snug font-medium mb-8">{p.content}</p>
                  <div className="flex items-center justify-between pt-6 border-t border-zinc-50">
                     <div className="flex gap-8 items-center text-zinc-400 font-black text-[10px] uppercase"><span className="flex items-center gap-2 hover:text-pink-500 cursor-pointer"><Heart size={18}/> {p.hearts?.length || 0}</span><span className="flex items-center gap-2 hover:text-blue-400 cursor-pointer"><Repeat size={18}/> 0</span></div>
                     <button className="p-2 text-zinc-200 hover:text-red-500"><ShieldAlert size={18}/></button>
                  </div>
               </div>
             );
           })}
        </div>
      </div>
    );
  };

  const ChatView = () => {
    const handleSelectChat = (uid) => {
      const chatId = [user.uid, uid].sort().join('_');
      setActiveChatId(chatId);
    };

    return (
      <div className="pt-24 px-4 h-[85vh] max-w-6xl mx-auto flex gap-6 pb-10">
        <div className="w-full md:w-80 bg-white rounded-[40px] shadow-sm border border-zinc-50 p-6 overflow-y-auto">
           <h3 className="text-2xl font-serif font-bold mb-8">DMs</h3>
           <div className="space-y-4">
              {users.filter(u => u.uid !== user.uid).map(u => (
                <div key={u.uid} onClick={() => handleSelectChat(u.uid)} className={`flex items-center gap-4 p-4 rounded-3xl cursor-pointer transition-all ${activeChatId?.includes(u.uid) ? 'bg-pink-50 border-pink-100 border' : 'hover:bg-zinc-50 border-transparent border'}`}>
                   <img src={u.photoURL} className="w-12 h-12 rounded-2xl border" />
                   <div className="flex-1 min-w-0"><p className="font-black text-sm truncate">{u.username}</p><p className="text-[10px] text-zinc-300 truncate">Clique para conversar...</p></div>
                </div>
              ))}
           </div>
        </div>
        <div className="hidden md:flex flex-1 bg-white rounded-[40px] shadow-sm border border-zinc-50 flex-col overflow-hidden">
           {activeChatId ? (
              <>
                 <div className="p-6 border-b border-zinc-50 flex items-center gap-4 bg-zinc-50/30">
                    <div className="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center text-pink-500 font-black">A</div>
                    <h4 className="font-black">Sala de Aura</h4>
                 </div>
                 <div className="flex-1 p-8 overflow-y-auto space-y-6 flex flex-col">
                    {messages.map(m => (
                      <div key={m.id} className={`max-w-[70%] p-4 rounded-[2rem] text-sm font-medium ${m.senderId === user.uid ? 'self-end bg-pink-500 text-white rounded-br-none' : 'self-start bg-zinc-100 text-zinc-800 rounded-bl-none'}`}>
                        {m.text}
                      </div>
                    ))}
                 </div>
                 <form onSubmit={sendMessage} className="p-6 bg-zinc-50/50 flex gap-4">
                    <input name="msg" placeholder="Envia a tua aura..." className="flex-1 px-6 py-3 rounded-2xl border-none outline-none focus:ring-2 focus:ring-pink-200" />
                    <button className="p-3 bg-pink-500 text-white rounded-2xl shadow-lg hover:rotate-12 transition-transform"><Send size={20}/></button>
                 </form>
              </>
           ) : (
             <div className="flex-1 flex flex-col items-center justify-center text-zinc-300">
                <MessageCircle size={80} className="mb-4 opacity-10" />
                <p className="font-black uppercase text-[10px] tracking-widest">Seleciona um perfil para conversar</p>
             </div>
           )}
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (loading) return <div className="min-h-screen flex items-center justify-center"><Heart className="animate-pulse text-pink-500" size={60} fill="#ffb6c1" /></div>;

    switch(view) {
      case 'home':
        const filtered = posts.filter(p => p.title?.toLowerCase().includes(searchTerm.toLowerCase()));
        return (
          <div className="pt-24 px-4 md:px-8 max-w-[1900px] mx-auto pb-24">
             <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 gap-6">
                {filtered.map(p => <PostCard key={p.id} post={p} />)}
             </div>
             {user && !user.isAnonymous && (
                <button 
                  onClick={() => setView('upload')}
                  className="fixed bottom-10 right-10 w-20 h-20 bg-pink-500 text-white rounded-[40px] shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-[250] border-8 border-white"
                >
                  <Plus size={36} strokeWidth={3} />
                </button>
             )}
          </div>
        );
      case 'pulse': return <PulseTimeline />;
      case 'admin': return <AdminPanel />;
      case 'chat': return <ChatView />;
      case 'profile': return (
        <div className="pt-16 min-h-screen">
           <div className="h-[400px] md:h-[550px] relative">
              <img src={activeProfile?.coverURL} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent"></div>
              <div className="absolute bottom-12 left-6 md:left-20 right-6 flex flex-col md:flex-row items-center md:items-end gap-10">
                 <div className="w-32 h-32 md:w-52 md:h-52 rounded-[40px] border-8 border-white overflow-hidden shadow-2xl bg-white shrink-0"><img src={activeProfile?.photoURL} className="w-full h-full object-cover" /></div>
                 <div className="text-center md:text-left text-white flex-1">
                    <h2 className="text-4xl md:text-7xl font-serif font-bold tracking-tight mb-2 flex items-center justify-center md:justify-start gap-4">{activeProfile?.username} {activeProfile?.badges?.includes('verified') && <BadgeCheck size={32} className="text-blue-400" />}</h2>
                    <p className="text-lg md:text-2xl text-zinc-300 max-w-2xl mb-8 leading-relaxed font-medium">{activeProfile?.bio}</p>
                    <div className="flex justify-center md:justify-start gap-12 text-center">
                       <div><p className="text-2xl md:text-4xl font-black">{activeProfile?.followers?.length || 0}</p><p className="text-[10px] font-black uppercase text-pink-400 tracking-widest">Seguidores</p></div>
                       <div><p className="text-2xl md:text-4xl font-black">{activeProfile?.following?.length || 0}</p><p className="text-[10px] font-black uppercase text-pink-400 tracking-widest">A Seguir</p></div>
                       {activeProfile?.uid !== user?.uid && (
                          <button onClick={() => handleFollow(activeProfile?.uid)} className="ml-4 px-12 py-3 bg-pink-500 text-white rounded-full font-black text-xs uppercase shadow-2xl hover:bg-pink-600 transition-all">Seguir</button>
                       )}
                    </div>
                 </div>
              </div>
           </div>
           <div className="max-w-[1700px] mx-auto px-6 py-20">
              <div className="columns-2 md:columns-5 gap-8">
                 {posts.filter(p => p.userId === activeProfile?.uid).map(p => <PostCard key={p.id} post={p} />)}
              </div>
           </div>
        </div>
      );
      case 'upload':
        return (
          <div className="fixed inset-0 z-[300] bg-zinc-950/40 backdrop-blur-xl flex items-center justify-center p-4">
             <form onSubmit={handleUpload} className="bg-white w-full max-w-4xl rounded-[60px] p-8 md:p-16 relative shadow-2xl overflow-y-auto max-h-[90vh]">
                <button onClick={() => setView('home')} type="button" className="absolute top-8 right-8 p-3 bg-zinc-100 rounded-full"><X size={20}/></button>
                <h3 className="text-4xl font-serif font-bold mb-10">Novo Pin Estético</h3>
                <div className="space-y-6">
                   <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest opacity-30">URL da Imagem</label><input required name="url" placeholder="https://..." className="w-full p-5 bg-zinc-50 rounded-3xl outline-none focus:ring-4 focus:ring-pink-100 text-lg" /></div>
                   <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest opacity-30">Título</label><input required name="title" placeholder="Nome da Inspiração" className="w-full p-5 bg-zinc-50 rounded-3xl outline-none focus:ring-4 focus:ring-pink-100 text-lg" /></div>
                   <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest opacity-30">Descrição</label><textarea name="description" placeholder="A aura desta imagem..." className="w-full p-5 bg-zinc-50 rounded-3xl outline-none focus:ring-4 focus:ring-pink-100 text-lg h-32 resize-none" /></div>
                   <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest opacity-30">Tags (Separadas por vírgula)</label><input name="tags" placeholder="Estética, Vibe, Aura" className="w-full p-5 bg-zinc-50 rounded-3xl outline-none focus:ring-4 focus:ring-pink-100 text-lg" /></div>
                </div>
                <button type="submit" className="w-full bg-pink-500 text-white py-6 rounded-[2.5rem] font-black text-xs uppercase tracking-widest shadow-2xl mt-10 hover:scale-[1.02] transition-transform">Lançar no Universo</button>
             </form>
          </div>
        );
      case 'details':
        return (
          <div className="pt-24 px-4 md:px-8 max-w-7xl mx-auto pb-20 flex flex-col lg:flex-row gap-12">
             <div className="lg:w-2/3 rounded-[40px] overflow-hidden shadow-2xl bg-zinc-100 ring-1 ring-black/5"><img src={activePost?.image} className="w-full h-auto" /></div>
             <div className="lg:w-1/3 flex flex-col space-y-8">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-4 cursor-pointer" onClick={() => { setActiveProfile(users.find(u => u.uid === activePost?.userId)); setView('profile'); }}>
                      <img src={users.find(u => u.uid === activePost?.userId)?.photoURL} className="w-14 h-14 rounded-2xl border-2 border-pink-100" />
                      <div><h4 className="font-black text-xl">{users.find(u => u.uid === activePost?.userId)?.username}</h4><p className="text-[10px] font-black uppercase text-zinc-300">Ver Perfil</p></div>
                   </div>
                   <button className="bg-pink-500 text-white px-8 py-3 rounded-full font-black text-[10px] uppercase shadow-lg">Seguir</button>
                </div>
                <div><h2 className="text-3xl font-bold mb-4">{activePost?.title}</h2><p className="text-lg text-zinc-500 leading-relaxed font-medium">{activePost?.description}</p></div>
                <div className="flex gap-2 flex-wrap">
                   {activePost?.tags?.map(t => <span key={t} className="px-5 py-2.5 bg-pink-50 text-pink-500 rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-pink-100 cursor-pointer">#{t}</span>)}
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <button className="py-4 bg-zinc-950 text-white rounded-3xl font-black text-[10px] uppercase shadow-xl flex items-center justify-center gap-2"><Download size={20}/> Baixar</button>
                   <button className="py-4 bg-white border-2 border-zinc-100 text-zinc-900 rounded-3xl font-black text-[10px] uppercase hover:bg-zinc-50 flex items-center justify-center gap-2"><Share2 size={20}/> Partilhar</button>
                </div>
                <button className="pt-8 text-red-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2 hover:text-red-600"><Flag size={14}/> Denunciar Imagem</button>
             </div>
          </div>
        );
      case 'auth':
        return (
          <div className="min-h-screen flex items-center justify-center bg-pink-50/20 px-4">
             <div className="bg-white p-12 md:p-20 rounded-[80px] shadow-2xl w-full max-w-2xl text-center relative border-2 border-pink-50">
                <h2 className="text-6xl font-serif font-bold text-pink-500 mb-4 flex items-center justify-center gap-4"><Heart size={50} fill="#ffb6c1"/> AuraHeart</h2>
                <p className="text-zinc-400 mb-16 text-xl font-medium">Onde a inspiração visual vive.</p>
                <form className="space-y-6" onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await signInWithEmailAndPassword(auth, e.target.email.value, e.target.pass.value);
                    setView('home');
                  } catch { triggerToast("Falha no login. Verifica os dados.", "error"); }
                }}>
                   <input required name="email" type="email" placeholder="Email" className="w-full px-8 py-5 rounded-full bg-pink-50/50 border-none outline-none focus:ring-8 focus:ring-pink-100 text-xl font-medium" />
                   <input required name="pass" type="password" placeholder="Palavra-passe" className="w-full px-8 py-5 rounded-full bg-pink-50/50 border-none outline-none focus:ring-8 focus:ring-pink-100 text-xl font-medium" />
                   <button type="submit" className="w-full bg-pink-500 text-white py-6 rounded-full font-black text-xl uppercase tracking-widest shadow-2xl mt-4">Entrar</button>
                </form>
                <p className="mt-8 text-zinc-400 font-bold">Ainda não és Aura? <span className="text-pink-500 cursor-pointer hover:underline" onClick={async () => {
                  // Logic for simple account creation for demo
                  triggerToast("Criação de conta via email habilitada.");
                }}>Cria uma aqui</span></p>
             </div>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-900'} selection:bg-pink-200`}>
      {view !== 'auth' && <Navbar />}
      {renderContent()}
      
      {showNotification && (
        <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[500] px-10 py-4 rounded-full shadow-2xl flex items-center gap-3 font-black text-xs uppercase tracking-widest ${showNotification.type === 'success' ? 'bg-zinc-950 text-white' : 'bg-red-500 text-white'} animate-in slide-in-from-bottom-6 duration-500`}>
          <Heart fill={COLORS.primary} size={18} /> {showNotification.msg}
        </div>
      )}

      {view !== 'auth' && view !== 'admin' && (
        <footer className={`py-24 px-8 md:px-16 border-t ${darkMode ? 'bg-zinc-950 border-zinc-900' : 'bg-[#fffcfd] border-pink-50'}`}>
           <div className="max-w-[1700px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-16">
              <div className="space-y-6">
                 <h2 className="text-4xl font-serif font-bold text-pink-500 flex items-center gap-3"><Heart fill="#ffb6c1" size={32} /> AuraHeart</h2>
                 <p className="text-zinc-400 text-lg leading-relaxed font-medium">Capturando beleza, conectando almas visuais. A maior rede estética do planeta.</p>
              </div>
              <div className="space-y-8">
                 <h4 className="font-black text-[11px] uppercase tracking-[0.4em] text-zinc-300">Explorar</h4>
                 <ul className="space-y-4 text-zinc-500 font-bold text-lg">
                    <li className="hover:text-pink-500 cursor-pointer">Tendências</li>
                    <li className="hover:text-pink-500 cursor-pointer">Coleções</li>
                    <li className="hover:text-pink-500 cursor-pointer">Pulse</li>
                 </ul>
              </div>
              <div className="space-y-8">
                 <h4 className="font-black text-[11px] uppercase tracking-[0.4em] text-zinc-300">AuraHeart</h4>
                 <ul className="space-y-4 text-zinc-500 font-bold text-lg">
                    <li className="hover:text-pink-500 cursor-pointer">Sobre Nós</li>
                    <li className="hover:text-pink-500 cursor-pointer">Privacidade</li>
                    <li className="hover:text-pink-500 cursor-pointer">Cookies</li>
                 </ul>
              </div>
              <div className="space-y-8">
                 <h4 className="font-black text-[11px] uppercase tracking-[0.4em] text-zinc-300">Social</h4>
                 <div className="flex gap-4">
                    <div className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-pink-50 flex items-center justify-center text-pink-500"><Instagram size={24}/></div>
                    <div className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-pink-50 flex items-center justify-center text-pink-500"><Twitter size={24}/></div>
                    <div className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-pink-50 flex items-center justify-center text-pink-500"><Github size={24}/></div>
                 </div>
              </div>
           </div>
           <div className="max-w-[1700px] mx-auto mt-24 pt-8 border-t border-pink-50 flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-zinc-300">
              <p>© 2025 AuraHeart Global. All Rights Reserved.</p>
              <div className="flex items-center gap-2"><Globe size={14}/> <span>Português (PT)</span></div>
           </div>
        </footer>
      )}
    </div>
  );
}

