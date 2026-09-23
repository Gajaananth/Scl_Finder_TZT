export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center border-t border-slate-200/60 bg-white/70 backdrop-blur-xs mt-auto shrink-0">
      <div className="max-w-7xl mx-auto px-4 text-[11px] leading-relaxed text-slate-400">
        <div>&copy; {currentYear} St. Cecilia&rsquo;s Girls&rsquo; College. All rights reserved.</div>
        <div className="mt-0.5">
          Developed by{' '}
          <span className="font-semibold text-slate-500">Tradiq Zium Tech</span>
        </div>
      </div>
    </footer>
  );
}
