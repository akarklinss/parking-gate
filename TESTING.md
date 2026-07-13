# Testēšanas plāns

Fiziski iPhone un Android testi šajā paketē nav izpildīti.
Pirms pasākuma veic pārbaudi uz vismaz viena iPhone un viena Android telefona.

## iPhone Safari

1. Atver GitHub Pages adresi Safari.
2. Atļauj kameru.
3. Pārbaudi, ka pogas paliek nospiežamas pēc kameras ieslēgšanas.
4. Skenē vismaz 10 dažādas numurzīmes.
5. Pārbaudi kandidātu pogas un manuālo ievadi.
6. Pārbaudi IEBRAUKŠANA un IZBRAUKŠANA.
7. Pievieno aplikāciju Home Screen un atkārto testu.

## Android Chrome

1. Atver GitHub Pages adresi Chrome.
2. Atļauj kameru.
3. Pārbaudi aizmugurējo kameru, fokusu un zoom.
4. Atkārto OCR, manuālās ievades, IN un OUT testus.
5. Instalē PWA un atkārto testu.

## Vairākas ierīces

1. Atver aplikāciju divās ierīcēs.
2. Ievadi atšķirīgus Gate, apsargus un ierīču nosaukumus.
3. Pārbaudi, ka online ierīču skaits kļūst 2.
4. Veic darbību katrā ierīcē.
5. Pārbaudi LOG lapā Gate, apsargu un ierīci.

## OCR pieņemšanas kritērijs

Uz vismaz 10 numurzīmēm:

- vismaz 8/10 gadījumos pareizais numurs ir starp pirmajiem trim kandidātiem;
- manuālā korekcija vienmēr ir iespējama;
- automātiska ielaišana nenotiek bez apsarga apstiprinājuma.
