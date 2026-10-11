import { newDesign, uid, type Design } from './shared/model';
export interface Template { id: string; name: string; category: string; description: string; design: Design }
const rect = (x: number, y: number, w: number, h: number, fill: string, rx = 0) => ({ type: 'Rect', left: x, top: y, width: w, height: h, fill, rx, ry: rx, originX: 'left', originY: 'top', id: uid(), name: 'Color block' });
const circle = (x: number, y: number, r: number, fill: string) => ({ type: 'Circle', left: x, top: y, radius: r, fill, originX: 'left', originY: 'top', id: uid(), name: 'Circle' });
const text = (s: string, x: number, y: number, w: number, size: number, color: string, options = {}) => ({ type: 'Textbox', text: s, left: x, top: y, width: w, fontSize: size, fontFamily: 'Space Grotesk', fontWeight: 500, fill: color, originX: 'left', originY: 'top', id: uid(), name: s.split('\n')[0], ...options });
const specs = [
  ['Future in focus', 'YouTube', 'IDEAS THAT\nMOVE US.', 'A fresh perspective, every week', 1280, 720, '#181C2B', '#80E8DB', 'hero'],
  ['The studio journal', 'YouTube', 'THE STUDIO\nJOURNAL', 'Process. People. Possibilities.', 2560, 1440, '#F0E9DF', '#775BFF', 'editorial'],
  ['Small moments', 'Social Media', 'Make room\nfor joy.', 'A LITTLE DAILY INSPIRATION', 1080, 1080, '#EFE6D7', '#E48662', 'arch'],
  ['Launch day', 'Social Media', 'SOMETHING\nGOOD IS\nCOMING.', 'Meet the next chapter · 10.24', 1080, 1920, '#775BFF', '#80E8DB', 'hero'],
  ['Studio business card', 'Business', 'NOVA\nSTUDIO', 'Alex Morgan / Designer\nhello@example.com', 1050, 600, '#181C2B', '#80E8DB', 'editorial'],
  ['Company one-pager', 'Business', 'Built for\nwhat’s next.', 'INDEPENDENT THINKING / COLLECTIVE IMPACT', 1200, 1600, '#F6F7FB', '#775BFF', 'arch'],
  ['New collection', 'Marketing', 'Everyday,\nreimagined.', 'THE NEW COLLECTION / AUTUMN 2026', 1080, 1350, '#F1EADF', '#B85B47', 'arch'],
  ['Seasonal offer', 'Marketing', 'LESS SPEND.\nMORE STYLE.', 'A new season of possibilities · 25% off', 1600, 900, '#80E8DB', '#181C2B', 'hero'],
  ['Sound & space', 'Posters', 'SOUND\n& SPACE', 'LIVE SESSIONS / OCTOBER 24\nDOORS 7 PM / THE WAREHOUSE', 1748, 2480, '#181C2B', '#775BFF', 'hero'],
  ['Design symposium', 'Posters', 'MAKE\nWHAT’S\nNEXT.', 'DESIGN SYMPOSIUM\nIdeas worth sharing / November 12', 1748, 2480, '#F6F7FB', '#775BFF', 'editorial'],
  ['Community market', 'Flyers', 'GOOD\nTHINGS\nGATHER.', 'COMMUNITY MARKET\nSaturday 10–4 / Riverside Park', 1200, 1700, '#F3EBD6', '#5D8367', 'arch'],
  ['Workshop announcement', 'Flyers', 'A NEW\nPERSPECTIVE', 'CREATIVE WORKSHOP\nJoin us to explore, make and connect.', 1200, 1700, '#775BFF', '#80E8DB', 'editorial'],
  ['Garden gathering', 'Invitations', 'You’re\ninvited.', 'A GARDEN GATHERING\nJune 21 / 4 o’clock\nThe Glasshouse', 1500, 2100, '#F2ECE0', '#5D8367', 'arch'],
  ['Evening celebration', 'Invitations', 'An evening\ntogether.', 'PLEASE JOIN US\nSeptember 18 / Seven o’clock\nThe Grand Hall', 1500, 2100, '#181C2B', '#CDB785', 'editorial'],
  ['Clear resume', 'Resumes', 'ALEX\nMORGAN', 'DESIGNER & CREATIVE THINKER', 1240, 1754, '#FFFFFF', '#775BFF', 'resume'],
  ['Editorial resume', 'Resumes', 'JAMIE\nPARK', 'STRATEGY / DESIGN / STORYTELLING', 1240, 1754, '#F1EDE5', '#547366', 'resume'],
  ['Pitch deck', 'Presentations', 'Ideas into\nimpact.', 'YOUR COMPANY / INTRODUCTION / 2026', 1920, 1080, '#181C2B', '#80E8DB', 'deck'],
  ['Creative report', 'Presentations', 'A year of\npossibilities.', 'ANNUAL REVIEW / 2026', 1920, 1080, '#F1EDE5', '#775BFF', 'deck'],
  ['Orbit identity', 'Logos', 'ORBIT', 'INDEPENDENT BY DESIGN', 1000, 1000, '#181C2B', '#80E8DB', 'logo'],
  ['Field identity', 'Logos', 'FIELD', 'GROW SOMETHING GOOD', 1000, 1000, '#F1EDE5', '#547366', 'logo'],
  ['Lesson planner', 'Education', 'A week of\ndiscovery.', 'LEARNING PLAN / WEEK 01', 1240, 1754, '#F6F7FB', '#775BFF', 'planner'],
  ['Classroom notes', 'Education', 'LET’S\nEXPLORE.', 'NOTES, QUESTIONS & BRIGHT IDEAS', 1240, 1754, '#EAF3ED', '#547366', 'planner'],
  ['Personal manifesto', 'Personal Projects', 'DO MORE\nOF WHAT\nMOVES YOU.', 'A NOTE TO MY FUTURE SELF', 1080, 1350, '#775BFF', '#80E8DB', 'hero'],
  ['Monthly intentions', 'Personal Projects', 'Space to\nbegin again.', 'MY INTENTIONS / THIS MONTH', 1080, 1350, '#F1EDE5', '#B85B47', 'planner'],
] as const;
export const templates: Template[] = specs.map(([name, category, title, subtitle, w, h, bg, accent, layout], i) => {
  const d = newDesign(name, w, h); const page = d.pages[0]; page.background = bg;
  const light = ['#181C2B', '#775BFF'].includes(bg); const ink = light ? '#F6F7FB' : '#181C2B'; const m = w * .075; const size = Math.min(w * .115, h * .12);
  const objects: any[] = [text('FORMA / ' + category.toUpperCase(), m, h * .055, w * .85, w * .018, ink, { charSpacing: 180 }), rect(m, h * .12, w * .85, Math.max(2, w * .002), accent)];
  if (layout === 'hero') objects.push(circle(w * .62, h * .25, Math.min(w, h) * .26, accent), circle(w * .72, h * .4, Math.min(w, h) * .15, bg), text(title, m, h * .25, w * .8, size * 1.1, ink, { fontWeight: 700 }));
  else if (layout === 'logo') objects.push(circle(w * .36, h * .22, w * .14, accent), circle(w * .42, h * .28, w * .08, bg), text(title, m, h * .55, w * .85, size, ink, { textAlign: 'center', charSpacing: 160 }));
  else if (layout === 'arch') objects.push(rect(w * .55, h * .25, w * .35, h * .52, accent, w * .18), circle(w * .65, h * .42, w * .12, bg), text(title, m, h * .2, w * .65, size, ink, { fontFamily: 'Lora' }));
  else objects.push(text(title, m, h * .2, w * .85, size, ink, { fontWeight: 700 }), rect(m, h * .55, w * .17, h * .045, accent, 6));
  if (layout === 'resume') objects.push(text('PROFILE\n\nThoughtful designer creating useful, expressive experiences.\n\nEXPERIENCE\n\nSenior Designer · Studio Name\n2022–Present\nLead brand and product design across multidisciplinary teams.\n\nDesigner · Company Name\n2019–2022\nDeveloped identities, campaigns and digital experiences.\n\nEDUCATION\n\nBA Design · University Name', m, h * .43, w * .58, w * .023, ink, { fontFamily: 'Inter', lineHeight: 1.25 }), text('CONTACT\n\nhello@example.com\nPortfolio URL\nCity, Country\n\nSKILLS\n\nBrand identity\nArt direction\nDigital design\nTypography', w * .72, h * .43, w * .23, w * .019, ink, { fontFamily: 'Inter' }));
  if (layout === 'planner') for (let row = 0; row < 5; row++) objects.push(text(['FOCUS', 'MAKE', 'LEARN', 'CONNECT', 'REFLECT'][row], m, h * (.52 + row * .072), w * .2, w * .021, ink), rect(w * .3, h * (.55 + row * .072), w * .62, 2, accent));
  objects.push(text(subtitle, m, h * .84, w * .85, w * .023, ink, { fontFamily: 'Inter', lineHeight: 1.3 }), text(String(i + 1).padStart(2, '0') + ' / EDIT YOUR OWN STORY', m, h * .94, w * .85, w * .013, ink, { charSpacing: 80 }));
  page.scene = { objects }; if (layout === 'deck') { const second = structuredClone(page); second.id = uid(); second.name = 'Our approach'; second.scene.objects = [rect(0, 0, w, h, accent), text('01 / OUR APPROACH', m, h * .1, w * .85, w * .025, bg), text('Think clearly.\nCreate boldly.', m, h * .3, w * .85, size, bg), text('Add your story here. Every element is editable.', m, h * .8, w * .85, w * .025, bg)]; d.pages.push(second); }
  return { id: 'forma-' + (i + 1), name, category, description: subtitle.replaceAll('\n', ' · '), design: d };
});
