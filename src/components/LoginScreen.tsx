import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useI18n } from '../lib/I18nContext';
import logoImg from '../assets/logo.png';
import Footer from './Footer';

export default function LoginScreen() {
  const { login } = useAuth();
  const { language, setLanguage } = useI18n();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email.trim(), password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Language toggle in top-right */}
      <div className="flex justify-end p-4">
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/60">
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              language === 'en'
                ? 'bg-white text-brand-dark shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
            aria-label="Switch to English"
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLanguage('ta')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              language === 'ta'
                ? 'bg-white text-brand-dark shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
            aria-label="Switch to Tamil"
          >
            தமிழ்
          </button>
        </div>
      </div>

      {/* Centered login card */}
      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200/80 p-8 animate-fade-in">
            {/* School branding */}
            <div className="text-center mb-8">
              <img
                src={logoImg}
                alt="St. Cecilia's Girls' College crest"
                className="w-20 h-20 mx-auto rounded-full object-cover shadow-lg shadow-brand/15 border-2 border-brand/20"
              />
              <h1 className="mt-4 text-xl font-extrabold text-slate-900 tracking-tight">
                St. Cecilia&rsquo;s Girls&rsquo; College
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Grade 1 Admission: School Finder
              </p>
            </div>

            {/* Staff Login heading */}
            <div className="text-center mb-6">
              <h2 className="text-base font-bold text-slate-700">Staff Login</h2>
              <p className="text-xs text-slate-400 mt-1">
                Authorized staff only. Contact administration for access.
              </p>
            </div>

            {/* Error alert */}
            {error && (
              <div
                className="mb-4 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2"
                role="alert"
              >
                <svg className="w-4 h-4 shrink-0 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Login form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email Address
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  required
                  autoComplete="email"
                  className="w-full px-4 py-3 text-sm border-2 border-slate-200 rounded-xl bg-white text-slate-800
                    placeholder:text-slate-400 focus:border-brand focus:ring-4 focus:ring-brand/10
                    focus:outline-none transition-all duration-200"
                />
              </div>

              <div>
                <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className="w-full pl-4 pr-11 py-3 text-sm border-2 border-slate-200 rounded-xl bg-white text-slate-800
                      placeholder:text-slate-400 focus:border-brand focus:ring-4 focus:ring-brand/10
                      focus:outline-none transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1.5 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/20"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !email.trim() || !password}
                className={`w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200
                  flex items-center justify-center gap-2 cursor-pointer
                  ${
                    isSubmitting || !email.trim() || !password
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-brand text-white hover:bg-brand-dark active:bg-brand-dark shadow-lg shadow-brand/25'
                  }`}
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in…
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
