import { useEffect, useState } from "react";
import { ArrowUpLeft, LoaderCircle, Moon, ShieldCheck, Sun } from "lucide-react";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import BrandMark from "@/components/BrandMark";
import VoiceWorkspace from "@/components/voice-studio/VoiceWorkspace";

export default function Home() {
  const { loading, user, logout } = useAuth();
  if (loading) {
    return (
      <main className="auth-screen" dir="rtl" aria-busy="true">
        <div className="auth-loading"><LoaderCircle className="spin" size={22} /> جارٍ التحقق من جلستك…</div>
      </main>
    );
  }
  if (user) return <VoiceWorkspace user={user} onLogout={logout} />;
  return <SignInScreen />;
}

function SignInScreen() {
  const { theme, toggleTheme } = useTheme();
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [loginError, setLoginError] = useState("");
  const isArabic = language === "ar";

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = isArabic ? "rtl" : "ltr";
  }, [language, isArabic]);

  const handleLogin = () => {
    try {
      startLogin();
    } catch {
      setLoginError(isArabic ? "لم يُضبط تسجيل الدخول لهذه المعاينة بعد." : "Sign-in is not configured for this preview yet.");
    }
  };

  return (
    <main className="auth-screen" dir={isArabic ? "rtl" : "ltr"}>
      <div className="auth-glow auth-glow--one" />
      <div className="auth-glow auth-glow--two" />
      <header className="auth-header">
        <BrandMark size={38} />
        <div className="auth-tools">
          <button className="icon-button" onClick={() => setLanguage(isArabic ? "en" : "ar")} aria-label={isArabic ? "Switch language to English" : "التبديل إلى العربية"}>
            <span className="language-chip">{isArabic ? "EN" : "ع"}</span>
          </button>
          <button className="icon-button" onClick={() => toggleTheme?.()} aria-label={isArabic ? "تبديل المظهر" : "Toggle theme"}>
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>

      <section className="auth-content">
        <div className="auth-orbit" aria-hidden="true"><BrandMark size={76} wordmark={false} /></div>
        <p className="eyebrow">{isArabic ? "استوديو الصوت الذكي" : "THE VOICE WORKSPACE"}</p>
        <h1>{isArabic ? "حوّل الفكرة إلى صوتٍ حيّ." : "Give your ideas a voice."}</h1>
        <p className="auth-copy">
          {isArabic
            ? "استنسخ صوتك بموافقتك، ثم حوّل موضوعك إلى كلام طبيعي قابل للاستماع والتنزيل."
            : "Clone a voice with your consent, then turn a prompt into natural speech you can play and download."}
        </p>

        <div className="auth-card">
          <div className="auth-card-icon"><ShieldCheck size={19} /></div>
          <h2>{isArabic ? "مساحتك الصوتية، خاصة بك" : "Your voice workspace"}</h2>
          <p>{isArabic ? "سجّل الدخول لحفظ المحادثات والأصوات المستنسخة وإعداداتك." : "Sign in to save your conversations, cloned voices, and settings."}</p>
          <button className="primary-button auth-login" onClick={handleLogin}>
            {isArabic ? "المتابعة باستخدام Manus" : "Continue with Manus"}
            <ArrowUpLeft size={17} />
          </button>
          {loginError ? <p className="inline-error" role="alert">{loginError}</p> : null}
          <p className="auth-footnote">{isArabic ? "تسجيل دخول آمن · لا نطلب كلمة مرور منفصلة" : "Secure sign-in · no separate password"}</p>
        </div>
      </section>

      <footer className="auth-footer">
        <span>3ZAI Voice Studio</span>
        <span>{isArabic ? "أصواتك. أفكارك. بإذنك." : "Your voices. Your ideas. With your consent."}</span>
      </footer>
    </main>
  );
}
