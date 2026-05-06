import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  onSnapshot, 
  deleteDoc, 
  query, 
  writeBatch 
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  Settings, 
  Play, 
  Plus, 
  Trash2, 
  Upload, 
  RotateCcw, 
  X,
  Database
} from 'lucide-react';

// Firebase 配置 (由系統提供)
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'soul-artist-default';

export default function App() {
  const [user, setUser] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [view, setView] = useState('slot'); // 'slot' 或 'admin'
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  // 拉霸機控制
  const reelRefs = [useRef(), useRef(), useRef(), useRef()];
  const [currentSentence, setCurrentSentence] = useState("點擊按鈕來抽取題目");

  // 1. 初始化 Auth (符合規則 3)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. 獲取資料 (符合規則 1 & 2)
  useEffect(() => {
    if (!user) return;

    // 公開路徑：/artifacts/{appId}/public/data/questions
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'questions');
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setQuestions(data);
      setLoading(false);
    }, (err) => {
      console.error("Firestore error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 拉霸邏輯
  const spin = () => {
    if (isSpinning || questions.length === 0) return;
    setIsSpinning(true);
    setCurrentSentence("???");
    setResult(null);

    const targetIndex = Math.floor(Math.random() * questions.length);
    const itemHeight = window.innerWidth <= 640 ? 70 : 150;

    reelRefs.forEach((ref, i) => {
      if (!ref.current) return;
      // 旋轉動畫：基本 2 圈 + 目標索引
      const offset = (questions.length * 2 + targetIndex) * itemHeight;
      ref.current.style.transition = `transform ${2 + i * 0.4}s cubic-bezier(0.1, 0, 0.1, 1)`;
      ref.current.style.transform = `translateY(-${offset}px)`;
    });

    setTimeout(() => {
      setIsSpinning(false);
      const q = questions[targetIndex];
      const sentence = `${q.who}在${q.where}${q.do1}，同時${q.do2}`;
      setCurrentSentence(sentence);
      setResult(q);

      // 重設位置以便下次旋轉
      reelRefs.forEach((ref) => {
        if (!ref.current) return;
        ref.current.style.transition = 'none';
        ref.current.style.transform = `translateY(-${targetIndex * itemHeight}px)`;
      });
    }, 2000 + (reelRefs.length - 1) * 400 + 100);
  };

  // 管理功能
  const addQuestion = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newQ = {
      who: formData.get('who'),
      where: formData.get('where'),
      do1: formData.get('do1'),
      do2: formData.get('do2'),
      createdAt: Date.now()
    };
    
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'questions'), newQ);
      e.target.reset();
    } catch (err) {
      alert("儲存失敗: " + err.message);
    }
  };

  const deleteQuestion = async (id) => {
    if (!confirm("確定要刪除這筆題目嗎？")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'questions', id));
    } catch (err) {
      alert("刪除失敗");
    }
  };

  const importInitialData = async () => {
    const raw = [
      ["哥吉拉", "百貨公司", "逛街", "買花瓶"],
      ["多拉A夢", "海邊", "露營", "吃螃蟹"],
      ["唐老鴨", "烤鴨店", "買一鴨三吃", "跳街舞"],
      ["派大星", "瑜珈教室", "跳 KPOP 舞", "吃糖葫蘆"],
      ["三眼怪", "娃娃機店", "吃串燒", "夾娃娃"],
      ["大岩蛇", "池塘", "捉泥鰍", "吹泡泡"],
      ["皮卡丘", "公園", "散步", "玩皮球"],
      ["史努比", "屋頂", "睡覺", "曬太陽"],
      ["海綿寶寶", "廚房", "煎魚", "唱歌"],
      ["兩津勘吉", "派出所", "打電動", "被所長罵"]
    ];

    const batch = [];
    raw.forEach(r => {
      batch.push(addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'questions'), {
        who: r[0], where: r[1], do1: r[2], do2: r[3], createdAt: Date.now()
      }));
    });
    await Promise.all(batch);
    alert("預設題目匯入成功！");
  };

  // 批量上傳解析
  const bulkUpload = async (e) => {
    const text = prompt("請貼上 CSV 格式內容 (格式：主角,地點,動作1,動作2)\n每行一筆資料");
    if (!text) return;

    const lines = text.split('\n').filter(line => line.trim());
    const batchPromises = lines.map(line => {
      const parts = line.split(',').map(p => p.trim());
      if (parts.length >= 4) {
        return addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'questions'), {
          who: parts[0], where: parts[1], do1: parts[2], do2: parts[3], createdAt: Date.now()
        });
      }
      return null;
    }).filter(p => p !== null);

    await Promise.all(batchPromises);
    alert(`成功匯入 ${batchPromises.length} 筆資料`);
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">載入中...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 font-sans text-slate-100 p-4 md:p-8">
      
      {/* 導覽列 */}
      <nav className="max-w-4xl mx-auto flex justify-between items-center mb-8 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-yellow-400 rounded-lg flex items-center justify-center shadow-lg">
            <Database className="text-slate-900 w-6 h-6" />
          </div>
          <span className="text-xl font-black tracking-tighter">靈魂繪師 <span className="text-yellow-400">Pro</span></span>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setView('slot')}
            className={`px-4 py-2 rounded-xl flex items-center gap-2 transition ${view === 'slot' ? 'bg-yellow-400 text-slate-900 font-bold' : 'hover:bg-white/10'}`}
          >
            <Play size={18} /> 抽題模式
          </button>
          <button 
            onClick={() => setView('admin')}
            className={`px-4 py-2 rounded-xl flex items-center gap-2 transition ${view === 'admin' ? 'bg-yellow-400 text-slate-900 font-bold' : 'hover:bg-white/10'}`}
          >
            <Settings size={18} /> 管理後台
          </button>
        </div>
      </nav>

      {view === 'slot' ? (
        /* --- 抽獎前台 --- */
        <div className="max-w-4xl mx-auto animate-in fade-in duration-500">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-blue-200">命運拉霸機</h2>
            <p className="text-slate-400">目前題庫中有 {questions.length} 組題目</p>
          </div>

          <div className="relative bg-slate-800 p-6 rounded-[2rem] border-8 border-yellow-500 shadow-2xl">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-950 p-4 rounded-xl border-4 border-slate-700 overflow-hidden">
              {['主角', '地點', '動作一', '動作二'].map((label, idx) => (
                <div key={label} className="flex flex-col gap-2">
                  <div className="text-center text-yellow-500 text-xs font-black uppercase tracking-widest">{label}</div>
                  <div className="h-[150px] bg-white rounded-lg overflow-hidden relative shadow-inner">
                    <div 
                      ref={reelRefs[idx]}
                      className="absolute w-full flex flex-col"
                    >
                      {questions.length > 0 ? (
                        // 重複顯示以確保捲動連續性
                        [...questions, ...questions, ...questions].map((q, i) => (
                          <div key={i} className="h-[150px] flex items-center justify-center text-center p-2 text-slate-800 font-bold text-lg border-b border-slate-100">
                            {q[Object.keys(columns[idx])[1]] || q[['who', 'where', 'do1', 'do2'][idx]]}
                          </div>
                        ))
                      ) : (
                        <div className="h-[150px] flex items-center justify-center text-slate-300">無資料</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex justify-center">
              <button 
                onClick={spin}
                disabled={isSpinning || questions.length === 0}
                className={`group relative py-4 px-16 rounded-full text-2xl font-black transition-all transform active:scale-95 shadow-2xl
                  ${isSpinning || questions.length === 0 ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-yellow-400 text-slate-900 hover:bg-yellow-300 hover:-translate-y-1'}
                `}
              >
                {isSpinning ? '靈魂抽取中...' : '開始抽選！'}
                <div className="absolute inset-0 rounded-full border-4 border-white/30 animate-ping hidden group-hover:block"></div>
              </button>
            </div>

            {/* 結果面板 */}
            <div className="mt-8 bg-slate-900/50 rounded-2xl p-6 text-center border border-white/10 min-h-[120px] flex flex-col justify-center">
              <div className="text-slate-500 text-sm mb-2 font-bold uppercase tracking-widest">抽選結果</div>
              <div className={`text-2xl md:text-3xl font-black transition-all ${isSpinning ? 'opacity-30 blur-sm' : 'text-yellow-300'}`}>
                {currentSentence}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* --- 管理後台 --- */
        <div className="max-w-5xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* 新增表單 */}
            <div className="lg:col-span-1">
              <div className="bg-slate-800 p-6 rounded-2xl border border-white/10 shadow-xl sticky top-8">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <Plus className="text-yellow-400" /> 新增單筆題目
                </h3>
                <form onSubmit={addQuestion} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">主角</label>
                    <input name="who" required placeholder="例如：皮卡丘" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 focus:border-yellow-500 outline-none transition" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">地點</label>
                    <input name="where" required placeholder="例如：公園" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 focus:border-yellow-500 outline-none transition" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">動作一</label>
                    <input name="do1" required placeholder="例如：散步" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 focus:border-yellow-500 outline-none transition" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">動作二</label>
                    <input name="do2" required placeholder="例如：玩皮球" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 focus:border-yellow-500 outline-none transition" />
                  </div>
                  <button type="submit" className="w-full bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg hover:bg-yellow-300 transition-colors shadow-lg">
                    確認新增
                  </button>
                </form>

                <hr className="my-6 border-slate-700" />
                
                <div className="space-y-3">
                  <button onClick={bulkUpload} className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-lg flex items-center justify-center gap-2 font-bold transition">
                    <Upload size={18} /> 批量匯入 CSV
                  </button>
                  {questions.length === 0 && (
                    <button onClick={importInitialData} className="w-full bg-slate-700 hover:bg-slate-600 py-3 rounded-lg flex items-center justify-center gap-2 font-bold transition">
                      <RotateCcw size={18} /> 匯入範例題庫
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 題目列表 */}
            <div className="lg:col-span-2">
              <div className="bg-slate-800 rounded-2xl border border-white/10 shadow-xl overflow-hidden">
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
                  <h3 className="text-xl font-bold">目前題庫 ({questions.length})</h3>
                  <p className="text-xs text-slate-400">Firestore 即時同步</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-900 text-slate-400 text-xs font-black uppercase tracking-tighter">
                        <th className="p-4">主角</th>
                        <th className="p-4">地點</th>
                        <th className="p-4">動作一</th>
                        <th className="p-4">動作二</th>
                        <th className="p-4 text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {questions.map((q) => (
                        <tr key={q.id} className="hover:bg-white/5 transition-colors group">
                          <td className="p-4 font-bold text-yellow-100">{q.who}</td>
                          <td className="p-4 text-slate-300">{q.where}</td>
                          <td className="p-4 text-slate-300">{q.do1}</td>
                          <td className="p-4 text-slate-300">{q.do2}</td>
                          <td className="p-4 text-center">
                            <button 
                              onClick={() => deleteQuestion(q.id)}
                              className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition"
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {questions.length === 0 && (
                        <tr>
                          <td colSpan="5" className="p-12 text-center text-slate-500 italic">
                            目前沒有題目，請從左側新增或匯入。
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 底部資訊 */}
      <footer className="max-w-4xl mx-auto mt-12 text-center text-slate-500 text-xs">
        <p>靈魂繪師雲端後台版 • 資料儲存於 Firestore</p>
        <p className="mt-1">User ID: {user?.uid || '未登入'}</p>
      </footer>
    </div>
  );
}

const columns = [
  { label: '主角', key: 'who' },
  { label: '地點', key: 'where' },
  { label: '動作一', key: 'do1' },
  { label: '動作二', key: 'do2' }
];
