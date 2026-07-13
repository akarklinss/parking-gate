# Parking Gate — React + Vite

## Iekļauts

- kamera uz iPhone un Android;
- piecu kadru OCR;
- OpenCV asāko kadru atlase;
- vairāki attēla apstrādes varianti;
- Tesseract OCR;
- salīdzināšana ar Google Sheet PARKING sarakstu;
- tipisko OCR kļūdu O/0, I/1, S/5, B/8, Z/2 apstrāde;
- trīs ticamāko kandidātu pogas;
- manuāla numura labošana;
- IEBRAUKŠANA / IZBRAUKŠANA;
- BLOCKED un derīguma laiki;
- LOG, Gate, apsargs un ierīce;
- reāllaika statistika;
- online ierīču skaits;
- QR jaunas ierīces pieslēgšanai;
- PWA un automātiski atjauninājumi.

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

## Apps Script

Failu `apps-script/Code.gs` ielīmē Google Sheet Apps Script projektā un
pārpublicē kā Web App:

- Execute as: Me
- Who has access: Anyone

## GitHub Pages

Repo Settings → Pages → Source: GitHub Actions.

Workflow `.github/workflows/deploy.yml` automātiski:

1. instalē pakotnes;
2. izpilda unit testus;
3. uzbūvē Vite aplikāciju;
4. publicē GitHub Pages.

## Jauns pasākums

1. Izveido Google Sheet kopiju no šablona.
2. Pārpublicē Apps Script un iegūsti jaunu `/exec` URL.
3. Aplikācijā nospied ⚙.
4. Ievadi jauno pasākuma nosaukumu, `/exec` URL, Gate, apsargu un ierīci.
5. Saglabā.

Var izmantot Admin paneļa QR kodu. QR aizpilda pasākuma nosaukumu,
API URL un atslēgu. Gate, apsargu un ierīci jaunajā telefonā ievada atsevišķi.

## Par OCR

React pats OCR precizitāti nepalielina. Precizitāti uzlabo:

- vairāki kadri;
- asāko kadru atlase;
- OpenCV priekšapstrāde;
- vairāki OCR mēģinājumi;
- salīdzināšana ar iepriekš zināmo PARKING sarakstu.

Apsargam vienmēr jāapstiprina kandidāts pirms ielaišanas.
