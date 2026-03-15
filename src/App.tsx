/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Upload, 
  Image as ImageIcon, 
  X, 
  Loader2, 
  Copy, 
  Check, 
  Languages, 
  Grid3X3, 
  Camera,
  Plus,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SHOT_TYPES = [
  { id: 'ews', label: '大远景', en: 'Extreme Wide Shot' },
  { id: 'ws', label: '远景', en: 'Wide Shot' },
  { id: 'fs', label: '全景', en: 'Full Shot' },
  { id: 'ms', label: '中景', en: 'Medium Shot' },
  { id: 'mcu', label: '中特写', en: 'Medium Close-up' },
  { id: 'cu', label: '特写', en: 'Close-up' },
  { id: 'ecu', label: '大特写', en: 'Extreme Close-up' },
  { id: 'la', label: '低角度', en: 'Low Angle' },
  { id: 'ha', label: '高角度', en: 'High Angle' },
  { id: 'bev', label: '鸟瞰', en: 'Bird\'s Eye View' },
];

interface Shot {
  id: string;
  typeId: string;
  description: string;
}

export default function App() {
  const [images, setImages] = useState<{ file: File; preview: string; base64: string }[]>([]);
  const [sceneDescription, setSceneDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [shots, setShots] = useState<Shot[]>(
    Array.from({ length: 9 }, (_, i) => ({
      id: `shot-${i + 1}`,
      typeId: SHOT_TYPES[Math.min(i, SHOT_TYPES.length - 1)].id,
      description: ''
    }))
  );
  const [generatedPrompt, setGeneratedPrompt] = useState({ cn: '', en: '' });
  const [displayLanguage, setDisplayLanguage] = useState<'cn' | 'en'>('cn');
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newImages = await Promise.all(
      files.map(async (file: File) => {
        const preview = URL.createObjectURL(file);
        const base64 = await fileToBase64(file);
        return { file, preview, base64: base64.split(',')[1] };
      })
    );

    setImages((prev) => [...prev, ...newImages]);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const removeImage = (index: number) => {
    setImages((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  };

  const analyzeImages = async () => {
    if (images.length === 0) return;
    setIsAnalyzing(true);
    try {
      const parts = [
        { text: "Analyze these reference images and provide a detailed scene description in Chinese. Focus on: 1. Main subjects (characters/objects) and their appearance/clothing. 2. Environment and setting. 3. Lighting and atmosphere. 4. Art style. Keep it concise but descriptive enough for AI image generation consistency." },
        ...images.map(img => ({
          inlineData: {
            mimeType: img.file.type,
            data: img.base64
          }
        }))
      ];

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts }
      });

      setSceneDescription(response.text || '');
    } catch (error) {
      console.error("Analysis failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateFinalPrompt = async () => {
    if (!sceneDescription) return;
    setIsGenerating(true);
    try {
      const shotDetails = shots.map((shot, i) => {
        const type = SHOT_TYPES.find(t => t.id === shot.typeId);
        return `镜头${String(i + 1).padStart(2, '0')}：${type?.label}${shot.description ? `，${shot.description}` : ''}`;
      }).join('\n');

      const prompt = `
        Based on this scene description: "${sceneDescription}"
        
        Generate a professional AI image generation prompt in the EXACT following format:
        
        根据［${sceneDescription}］，生成一张具有凝聚力的［3x3］网格图像，包含在同一环境境中的［9］个不同摄像机镜头，严格保持人物/物体、服装和光线的一致性，［8K分辨率，［16:9］画幅。
        ${shotDetails}
        
        Instructions:
        1. The "根据［...］" part should contain a concise summary of the scene description.
        2. Each "镜头XX：" should describe the specific camera angle and any additional details provided.
        3. Provide the output in TWO versions: Chinese (CN) and English (EN).
        4. The English version should follow the same structure but translated naturally for AI models like Midjourney.
        
        Format the response as a JSON object with keys "cn" and "en".
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const result = JSON.parse(response.text || '{}');
      setGeneratedPrompt(result);
    } catch (error) {
      console.error("Generation failed:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    const text = displayLanguage === 'cn' ? generatedPrompt.cn : generatedPrompt.en;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const updateShot = (index: number, updates: Partial<Shot>) => {
    setShots(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  };

  const resetAll = () => {
    setImages([]);
    setSceneDescription('');
    setGeneratedPrompt({ cn: '', en: '' });
    setShots(
      Array.from({ length: 9 }, (_, i) => ({
        id: `shot-${i + 1}`,
        typeId: SHOT_TYPES[Math.min(i, SHOT_TYPES.length - 1)].id,
        description: ''
      }))
    );
  };

  return (
    <div className="min-h-screen bg-[#F5F5F4] text-[#1C1917] font-sans p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-black rounded-lg">
                <Grid3X3 className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Storyboard Prompt Architect</h1>
            </div>
            <p className="text-stone-500 max-w-2xl italic serif">
              根据参考图反推场景，并生成具有高度一致性的 3x3 分镜网格提示词。
            </p>
          </div>
          <button 
            onClick={resetAll}
            className="flex items-center gap-2 px-4 py-2 text-stone-400 hover:text-stone-600 transition-colors text-sm font-medium"
          >
            <Trash2 className="w-4 h-4" />
            清空全部
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Upload & Scene */}
          <div className="lg:col-span-1 space-y-6">
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-2">
                <Upload className="w-4 h-4" /> 1. 上传参考图
              </h2>
              
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-stone-200 rounded-xl p-8 text-center cursor-pointer hover:border-stone-400 transition-colors group"
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                  multiple 
                  accept="image/*" 
                  className="hidden" 
                />
                <div className="flex flex-col items-center gap-2">
                  <ImageIcon className="w-8 h-8 text-stone-300 group-hover:text-stone-500 transition-colors" />
                  <p className="text-sm text-stone-500">点击或拖拽上传图片</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <AnimatePresence>
                  {images.map((img, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="relative aspect-square rounded-lg overflow-hidden border border-stone-100 group"
                    >
                      <img src={img.preview} alt="" className="w-full h-full object-cover" />
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                        className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              <button 
                onClick={analyzeImages}
                disabled={images.length === 0 || isAnalyzing}
                className="w-full py-3 bg-black text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:bg-stone-800 transition-colors"
              >
                {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                反推场景提示词
              </button>
            </section>

            <section className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-400">
                2. 场景描述
              </h2>
              <textarea 
                value={sceneDescription}
                onChange={(e) => setSceneDescription(e.target.value)}
                placeholder="分析后的场景描述将显示在这里..."
                className="w-full h-48 p-4 bg-stone-50 rounded-xl border-none focus:ring-2 focus:ring-black resize-none text-sm leading-relaxed"
              />
            </section>
          </div>

          {/* Right Column: Shot Config & Output */}
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-2">
                  <Grid3X3 className="w-4 h-4" /> 3. 配置分镜 (3x3 网格)
                </h2>
                <span className="text-xs text-stone-400">共 9 个镜头</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {shots.map((shot, idx) => (
                  <div key={shot.id} className="p-4 bg-stone-50 rounded-xl border border-stone-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-stone-400">镜头 {idx + 1}</span>
                      <select 
                        value={shot.typeId}
                        onChange={(e) => updateShot(idx, { typeId: e.target.value })}
                        className="text-xs bg-white border border-stone-200 rounded px-2 py-1 outline-none focus:border-black"
                      >
                        {SHOT_TYPES.map(type => (
                          <option key={type.id} value={type.id}>{type.label}</option>
                        ))}
                      </select>
                    </div>
                    <input 
                      type="text"
                      value={shot.description}
                      onChange={(e) => updateShot(idx, { description: e.target.value })}
                      placeholder="额外细节 (可选)"
                      className="w-full text-xs bg-transparent border-b border-stone-200 pb-1 outline-none focus:border-black"
                    />
                  </div>
                ))}
              </div>

              <button 
                onClick={generateFinalPrompt}
                disabled={!sceneDescription || isGenerating}
                className="w-full py-4 bg-black text-white rounded-xl font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:bg-stone-800 transition-colors"
              >
                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : "生成最终提示词"}
              </button>
            </section>

            {/* Output Section */}
            <AnimatePresence>
              {(generatedPrompt.cn || generatedPrompt.en) && (
                <motion.section 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-stone-900 text-white p-8 rounded-2xl shadow-xl space-y-6"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-400">
                        最终生成结果
                      </h2>
                      <div className="flex bg-stone-800 rounded-lg p-1">
                        <button 
                          onClick={() => setDisplayLanguage('cn')}
                          className={`px-3 py-1 text-xs rounded-md transition-colors ${displayLanguage === 'cn' ? 'bg-stone-700 text-white' : 'text-stone-500 hover:text-stone-300'}`}
                        >
                          中文
                        </button>
                        <button 
                          onClick={() => setDisplayLanguage('en')}
                          className={`px-3 py-1 text-xs rounded-md transition-colors ${displayLanguage === 'en' ? 'bg-stone-700 text-white' : 'text-stone-500 hover:text-stone-300'}`}
                        >
                          English
                        </button>
                      </div>
                    </div>
                    <button 
                      onClick={copyToClipboard}
                      className="flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 rounded-xl transition-colors text-sm"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      {copied ? "已复制" : "复制提示词"}
                    </button>
                  </div>

                  <div className="bg-stone-800/50 p-6 rounded-xl border border-stone-700/50">
                    <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-stone-200">
                      {displayLanguage === 'cn' ? generatedPrompt.cn : generatedPrompt.en}
                    </pre>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-stone-500 italic">
                    <Languages className="w-3 h-3" />
                    提示：此提示词专为 Midjourney 或类似支持网格生成的 AI 绘画工具优化。
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
