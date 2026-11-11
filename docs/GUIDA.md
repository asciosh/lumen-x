# Guida rapida a Lumen-X

Lumen-X ti dice, a partire dalle vendite di un prodotto, **quanto venderai** nelle prossime settimane, **quanto ordinare** e **quanto puoi
fidarti** della previsione. Non serve sapere niente di statistica.

Puoi vedere com'è fatto senza accedere: la [demo pubblica](https://asciosh.github.io/lumen-x/) usa dati d'esempio.

## 1. Entrare

L'app vera è in beta privata: possono entrare solo le persone invitate da chi la gestisce. Accedi con **Google** o con **GitHub** (quello
che hai comunicato per l'invito). Se vedi "Non è nell'elenco", chiedi di aggiungere il tuo indirizzo.

## 2. Il primo prodotto

- Nella prima schermata premi **Crea un prodotto d'esempio** se vuoi solo vedere come funziona: in pochi secondi trovi un prodotto con 240
  giorni di vendite inventate e la sua previsione.
- Per il tuo prodotto scrivi il **nome** e premi **Crea e continua**.

## 3. Caricare le vendite

Ti serve, **per ogni giorno, la data e quante unità hai venduto**. Va bene in due modi:

- **Un file CSV.** Da Excel: *Salva con nome*, formato *CSV*. Trascinalo nella zona indicata oppure premi *Scegli il file*.
- **Due colonne copiate da Excel.** Seleziona le colonne (la data e le unità vendute, con la riga dei titoli se c'è), copia, apri *Oppure
  incolla da Excel*, incolla e premi *Controlla*.

Le colonne possono chiamarsi come vuoi tra i nomi più comuni (*Data*, *Giorno*, *Venduto*, *Quantità*, *Pezzi*...). Se non le riconosco, ti
chiedo io quale colonna è la data e quale sono le unità. Le date vanno bene come `31/01/2025`, `31-01-2025` o `2025-01-31`.

**Prima di salvare vedi un'anteprima**: quanti giorni ho letto, da quando a quando, i primi giorni e, se ci sono righe che non ho capito,
quali sono e perché. Solo premendo **Importa questi dati** si salva qualcosa. Se lo stesso giorno compare più volte (per esempio un
elenco di singole vendite) ti chiedo se sommarle (di solito è la scelta giusta) o tenere solo l'ultima.

Dopo l'importazione la previsione parte da sola.

## 4. Leggere i tre riquadri

- **Quanto ordinare** (il riquadro evidenziato). Ti dice quante unità ti servono, tra quello che hai in magazzino e quello che ordini, per i
  prossimi giorni. Scrivi **quante ne hai già in magazzino** e premi *Aggiorna*: ti dice quante ordinarne.
  Il **margine di sicurezza** decide quanta merce in più tenere per non restare senza: *economico* (puoi restare senza circa 1 volta su 10),
  *normale* (1 su 20), *prudente* (1 su 50), *molto prudente* (1 su 100). Puoi anche cambiare i giorni per la consegna.
- **Quanto venderò.** Il totale dei prossimi giorni, la media al giorno, il confronto con gli ultimi giorni e il giorno più forte e più
  debole della settimana.
- **Quanto posso fidarmi.** Un giudizio in parole (*molto affidabile*, *abbastanza*, *poco*, *non affidabile*) con la spiegazione: di quanto
  la previsione ha sbagliato, in media, sui giorni che non conosceva. È **indicativo, non una garanzia**: se i giorni senza vendite sono
  molti, o se la previsione non fa meglio che ripetere la settimana scorsa, il giudizio non va oltre *poco affidabile*.

Sotto trovi il **grafico** (passa il mouse su un giorno per leggerne il valore) e *Chiedi ai tuoi dati*, con domande già pronte
("Quanto ho venduto negli ultimi 30 giorni?", "Cosa conviene ordinare?"...) a cui puoi anche rispondere scrivendo la tua.

Tutto ciò che è tecnico (metodo usato, errori, tabelle giorno per giorno, spiegazione completa, scarico dei file) sta in **Dettagli per
esperti**, ripiegato: aprilo solo se ti serve.

## 5. Impostazioni

Dal pulsante in alto: il tuo account, lo **scarico delle vendite** di ogni prodotto in CSV, lo stato della riscrittura con AI, la privacy
completa e **Cancella tutto**.

## Limiti e privacy in breve

- Fino a 10 prodotti, file di al massimo 1 MB e 5.000 righe per volta, 3.650 giorni per prodotto.
- La riscrittura con AI è facoltativa (20 al giorno): le arrivano solo numeri riassuntivi, mai le righe delle vendite né il nome del prodotto.
- Chi gestisce l'app potrebbe leggere tecnicamente il database: carica solo dati che ti va di condividere.
- Se accedi con Google, l'indirizzo serve solo a controllare l'invito e resta nel cookie di sessione: non viene salvato nel database.

## Se qualcosa non va

| Problema | Cosa fare |
| --- | --- |
| "Non è nell'elenco" | L'indirizzo (Google) o il nome (GitHub) con cui accedi non è stato aggiunto: chiedi a chi gestisce l'app. |
| "Non riesco a capire quale colonna è quale" | Scegli tu la colonna della data e quella delle unità vendute, poi *Controlla di nuovo*. |
| "«…» non sembra una data" | Scrivi le date come `31/01/2025` o `2025-01-31`. Gli anni a due cifre (`31/01/25`) non li accetto, perché non si distinguono in modo sicuro. |
| Le quantità sono importi in euro | Servono le **unità vendute**, non il fatturato: una colonna di importi non basta. |
| Ho un file `.xlsx` | Salvalo come CSV, oppure copia le colonne e incollale. |
| La previsione è "poco affidabile" | Servono più giorni di vendite, oppure il prodotto vende in modo molto irregolare. Usala con cautela. |
