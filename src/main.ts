import './styles.css';

const cleanRoute = new Set(['/access', '/member', '/owner', '/status']);
if (cleanRoute.has(window.location.pathname)) {
  window.location.replace(`${window.location.pathname}/${window.location.search}${window.location.hash}`);
}

document.documentElement.classList.add('js');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(pointer: fine)');
const parallax = document.querySelector<HTMLElement>('[data-parallax]');

let raf = 0;

function resetParallax() {
  if (!parallax) return;
  parallax.style.setProperty('--rx', '0deg');
  parallax.style.setProperty('--ry', '0deg');
}

function onPointerMove(event: PointerEvent) {
  if (!parallax || reducedMotion.matches || !finePointer.matches) return;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    const rect = parallax.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    parallax.style.setProperty('--rx', `${(-y * 6).toFixed(2)}deg`);
    parallax.style.setProperty('--ry', `${(x * 8).toFixed(2)}deg`);
  });
}

parallax?.addEventListener('pointermove', onPointerMove);
parallax?.addEventListener('pointerleave', resetParallax);
reducedMotion.addEventListener('change', resetParallax);

const reveals = document.querySelectorAll<HTMLElement>('[data-reveal]');

if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
  );

  reveals.forEach((element) => observer.observe(element));
} else {
  reveals.forEach((element) => element.classList.add('is-visible'));
}

const year = document.querySelector<HTMLElement>('#copyright-year');
if (year) year.textContent = ` © ${new Date().getFullYear()} THE FATHER ANALYTICS.`;