# Parking Gate v2

React + Vite PWA pasākumu auto iebraukšanas un izbraukšanas kontrolei.

## Jaunumi v2

- Nakts režīms ar saglabātu izvēli
- Pilnekrāna statusa reakcija: zaļa, dzeltena vai sarkana
- 3 kadru vieglais OCR
- Asāko kadru atlase bez smaga OpenCV mobilajā ceļā
- QR konfigurācijas pieslēgšanās jaunai ierīcei
- iPhone kameras priekšskatījums caur canvas

## Esošās funkcijas

- IN / OUT / BLOCKED
- Derīguma laiki
- Google Sheets PARKING un LOG
- Gate, apsargs un ierīce
- Reāllaika statistika
- Online ierīču uzskaite
- Manuāla numura korekcija
- PWA un GitHub Pages automātiska publicēšana

## PARKING kolonnas

A Auto Nr  
B Name Surname  
C Parking Area  
D Reģistrācijas laiks  
E Iebraukšanas laiks  
F Izbraukšanas laiks  
G Statuss  
H Derīgs no  
I Derīgs līdz  
J Piezīmes

## Build un testi

```bash
npm install
npm test
npm run build
```

## Publicēšana

GitHub Actions workflow automātiski izpilda testus, būvē Vite projektu un
publicē GitHub Pages.

## Svarīgi par QR

QR pieslēgšanās ir pasākuma konfigurācijas pārnešana, nevis individuāls
lietotāja konts. QR satur pasākuma nosaukumu, Apps Script URL un, ja lieto,
pasākuma atslēgu. Glabā QR privāti.
