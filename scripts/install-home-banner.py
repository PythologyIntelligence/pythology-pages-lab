from pathlib import Path
import re

IMAGE = Path('_site/png_images/pythology_environmental_ai_banner.png')
HOME = Path('_site/index.html')

if not IMAGE.exists():
    raise SystemExit('Approved Pythology title banner is missing from Pages artifact')

data = IMAGE.read_bytes()
if not data.startswith(b'\x89PNG\r\n\x1a\n'):
    raise SystemExit('Approved Pythology title banner is not a PNG')
if len(data) < 100_000:
    raise SystemExit(f'Approved Pythology title banner unexpectedly small: {len(data)} bytes')

if not HOME.exists():
    raise SystemExit('Homepage missing from Pages build')
html = HOME.read_text(encoding='utf-8')

preload = '<link rel="preload" as="image" href="png_images/pythology_environmental_ai_banner.png">'
if preload not in html:
    html = html.replace('</head>', f'  {preload}\n</head>', 1)

style = '''
  <style id="pythology-title-banner-style">
    .home-title-banner {
      position: relative;
      overflow: hidden;
      padding: clamp(10px, 1.4vw, 22px);
      background: radial-gradient(circle at 50% 0%, rgba(84,224,177,.09), transparent 42%), #03080a;
      border-bottom: 1px solid rgba(143,217,231,.14);
      isolation: isolate;
    }
    .home-title-banner::before {
      content: '';
      position: absolute;
      z-index: -1;
      inset: -25% 8% 0;
      background: radial-gradient(ellipse at center, rgba(47,203,151,.12), transparent 64%);
      filter: blur(28px);
      pointer-events: none;
    }
    .home-title-banner-frame {
      position: relative;
      width: min(100%, 1800px);
      margin: 0 auto;
      overflow: hidden;
      border: 1px solid rgba(143,217,231,.18);
      border-radius: clamp(12px, 1.4vw, 24px);
      background: #020607;
      box-shadow: 0 30px 90px rgba(0,0,0,.52), 0 0 70px rgba(47,203,151,.08);
    }
    .home-title-banner img {
      display: block;
      width: 100%;
      height: auto;
      object-fit: contain;
      filter: saturate(1.04) contrast(1.02);
    }
    @media (max-width: 680px) {
      .home-title-banner { padding: 0; }
      .home-title-banner-frame {
        width: 100%;
        border-inline: 0;
        border-radius: 0;
        box-shadow: 0 18px 54px rgba(0,0,0,.48);
      }
    }
  </style>
'''
if 'id="pythology-title-banner-style"' not in html:
    html = html.replace('</head>', style + '</head>', 1)

banner = '''
  <section class="home-title-banner" aria-label="Pythology Environmental AI Systems">
    <div class="home-title-banner-frame">
      <img src="png_images/pythology_environmental_ai_banner.png" alt="Pythology Environmental AI Systems — Monitor, Model, Predict, Protect" width="1672" height="941" fetchpriority="high">
    </div>
  </section>
'''
if '<section class="home-title-banner"' not in html:
    match = re.search(r'<main(?:\s[^>]*)?>', html, flags=re.IGNORECASE)
    if match:
        html = html[:match.end()] + banner + html[match.end():]
    elif '</header>' in html:
        html = html.replace('</header>', '</header>' + banner, 1)
    elif '<body>' in html:
        html = html.replace('<body>', '<body>' + banner, 1)
    else:
        raise SystemExit('Could not find safe title-banner insertion point in homepage')

HOME.write_text(html, encoding='utf-8')
print(f'Pythology title banner installed into Pages artifact: {len(data):,} bytes')
