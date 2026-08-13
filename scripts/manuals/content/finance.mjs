/**
 * Finance — staff training manual. English + Kiswahili.
 */

export default {
  department: ["Finance", "Fedha"],
  version: "1.0",
  languages: "English · Kiswahili",
  audience: "Finance desk",
  issued: "August 2026",
  contentsAlt: "Yaliyomo",

  sections: [
    {
      title: ["Welcome to the money desk", "Karibu kwenye kitengo cha fedha"],
      blurb: [
        "Everything this business is owed passes through your screen, and no cargo leaves the warehouse until you say it has been paid for.",
        "Kila deni la kampuni hii linapita kwenye skrini yako, na hakuna mzigo unaotoka ghalani hadi useme umelipiwa.",
      ],
      pages: [
        {
          title: ["Two things only you can do", "Mambo mawili unayoweza wewe pekee"],
          eyebrow: "Mission",
          blocks: [
            {
              type: "cards",
              columns: 2,
              items: [
                {
                  label: "Authority one",
                  title: ["Say that money has arrived", "Kuthibitisha kuwa pesa imefika"],
                  body: [
                    "Customer Care can take a customer's word and upload their proof. They cannot mark it received. Until Finance agrees, the money does not exist as far as this system is concerned.",
                    "Huduma kwa Wateja wanaweza kupokea maelezo ya mteja na kupakia ushahidi wake. Hawawezi kuthibitisha kuwa imepokelewa. Hadi Fedha wakubali, pesa hiyo haipo kwa mujibu wa mfumo huu.",
                  ],
                },
                {
                  label: "Authority two",
                  title: ["Free cargo from the warehouse", "Kuruhusu mzigo kutoka ghalani"],
                  body: [
                    "The counter cannot hand over boxes without a pickup note, and only Finance can issue one. When you issue it, cargo moves. When you do not, it stays.",
                    "Kaunta haiwezi kukabidhi mizigo bila hati ya kuchukua, na ni Fedha pekee wanaoweza kuitoa. Ukiitoa, mzigo unatoka. Usipoitoa, unabaki.",
                  ],
                },
              ],
            },
            {
              type: "callout",
              kind: "tip",
              text: [
                "*Everything else on your menu exists to explain a number after somebody asks about it.* Accounts, the ledger, expenses and reports are not daily work — they are where you go when the CEO asks where a figure came from.",
                "*Kila kitu kingine kwenye menyu yako kipo ili kueleza takwimu baada ya mtu kuuliza.* Akaunti, daftari, matumizi na ripoti si kazi ya kila siku — ni pale unapoenda Mkurugenzi anapouliza takwimu imetoka wapi.",
              ],
            },
            {
              type: "table",
              head: ["Your day", "What it means"],
              rows: [
                [["Read Home", "Soma ukurasa wa mwanzo"], ["The system has already written your to-do list.", "Mfumo tayari umeandika orodha yako ya kazi."]],
                [["Confirm the price", "Thibitisha bei"], ["Turn the system's draft figure into a real bill.", "Geuza takwimu ya rasimu kuwa ankara halisi."]],
                [["Verify payments", "Thibitisha malipo"], ["Check what Customer Care says it collected, against the proof.", "Kagua walichosema Huduma kwa Wateja wamekusanya, dhidi ya ushahidi."]],
                [["Record payments", "Andika malipo"], ["Money paid straight to you, always into a named account.", "Pesa iliyolipwa moja kwa moja kwako, daima kwenye akaunti iliyotajwa."]],
                [["Issue the pickup note", "Toa hati ya kuchukua"], ["The warehouse's authority to hand the cargo over.", "Kibali cha ghala kukabidhi mzigo."]],
                [["Chase what is owed", "Fuatilia madeni"], ["Work down Collections, oldest debt first.", "Fanyia kazi Ukusanyaji, ukianza na deni kongwe."]],
              ],
            },
          ],
        },
      ],
    },

    {
      title: ["Signing in", "Kuingia kwenye mfumo"],
      blurb: ["One address, one account.", "Anwani moja, akaunti moja."],
      pages: [
        {
          kind: "screen",
          title: ["The login screen", "Ukurasa wa kuingia"],
          eyebrow: "Step 1",
          route: "target-epress.vercel.app",
          intro: [
            "Type your work email and password. You land on the Finance home screen — the money, right now, and what needs you today.",
            "Andika barua pepe yako ya kazi na nenosiri. Utafika kwenye ukurasa wa Fedha — hali ya pesa kwa sasa, na kinachohitaji uangalizi wako leo.",
          ],
          figure: {
            shot: "login",
            crop: true,
            pins: [{ n: 1, x: 50, y: 44 }, { n: 2, x: 50, y: 57 }, { n: 3, x: 50, y: 70 }],
          },
          keys: [
            { n: 1, title: ["Email", "Barua pepe"], body: ["e.g. finance@targetexpress.co.tz", "mfano finance@targetexpress.co.tz"] },
            { n: 2, title: ["Password", "Nenosiri"], body: ["Change it from Profile once you are in.", "Ibadilishe kwenye Wasifu baada ya kuingia."] },
            { n: 3, title: ["Sign in", "Ingia"], body: ["Straight to the Finance home.", "Moja kwa moja hadi ukurasa wa Fedha."] },
          ],
          callout: {
            kind: "stop",
            text: [
              "Never share this account. It is the only one in the company that can say money arrived, and every verification carries your name permanently.",
              "Usishirikishe akaunti hii kamwe. Ndiyo pekee kampuni nzima inayoweza kuthibitisha pesa imefika, na kila uthibitisho hubeba jina lako milele.",
            ],
          },
        },
      ],
    },

    {
      title: ["Your home screen", "Ukurasa wako wa mwanzo"],
      blurb: ["The money, right now.", "Hali ya pesa, kwa sasa."],
      pages: [
        {
          kind: "screen",
          title: ["Home, section by section", "Ukurasa wa mwanzo, sehemu kwa sehemu"],
          eyebrow: "Dashboard",
          route: "/app/dashboard",
          intro: [
            "Your to-do list, written by the system rather than by you. Prices waiting to be confirmed, payments waiting to be checked, cargo that has sat too long. If this panel is empty, the desk is clear.",
            "Orodha yako ya kazi, imeandikwa na mfumo siyo na wewe. Bei zinazosubiri kuthibitishwa, malipo yanayosubiri kukaguliwa, mizigo iliyokaa muda mrefu. Paneli hii ikiwa tupu, kazi imekwisha.",
          ],
          figure: {
            shot: "home-hero",
            crop: true,
            pins: [{ n: 1, x: 55, y: 16 }, { n: 2, x: 55, y: 30 }, { n: 3, x: 60, y: 58 }, { n: 4, x: 10, y: 40 }],
          },
          keys: [
            { n: 1, title: ["The greeting banner", "Kichwa cha ukurasa"], body: ["Your name and the Finance badge.", "Jina lako na alama ya kitengo cha Fedha."] },
            { n: 2, title: ["The money, right now", "Hali ya pesa kwa sasa"], body: ["Owed to us, and collected today. Shillings lead; the dollar figure is what the invoice says.", "Tunachodai, na kilichokusanywa leo. Shilingi zinaongoza; kiasi cha dola ndicho kilicho kwenye ankara."] },
            { n: 3, title: ["Needs your attention", "Yanayohitaji uangalizi wako"], body: ["Ordered by what costs the business most. Work it from the top.", "Yamepangwa kwa hasara kubwa kwa kampuni. Anza kutoka juu."] },
            { n: 4, title: ["The sidebar", "Menyu ya kando"], body: ["Everything you can reach, grouped by the kind of work.", "Kila ukurasa unaoweza kufikia, umepangwa kwa aina ya kazi."] },
          ],
          callout: {
            kind: "warn",
            text: [
              "Finance sees the money, not the boxes. A warehouse hand signing in at the same moment sees cargo and *no figures at all*.",
              "Fedha wanaona pesa, siyo mizigo. Mfanyakazi wa ghala anayeingia wakati huo huo anaona mizigo na *hakuna takwimu za pesa kabisa*.",
            ],
          },
        },
      ],
    },

    {
      title: ["The sidebar, menu by menu", "Menyu ya kando, moja baada ya nyingine"],
      blurb: ["Where everything lives.", "Kila kitu kilipo."],
      pages: [
        {
          title: ["Every menu explained", "Kila menyu imeelezwa"],
          eyebrow: "Navigation",
          blocks: [
            {
              type: "table",
              head: ["Menu", "What it is, and when to use it"],
              rows: [
                [["General ledger", "/app/finance"], ["What the business is holding, what is owed to it, and what has moved.", "Kampuni inashikilia nini, inadai nini, na nini kimehama."]],
                [["Verify payments", "/app/finance/verify"], ["Claims Customer Care has collected. Nothing settles until you agree.", "Madai ya Huduma kwa Wateja kuwa wamekusanya. Hakuna kinachokamilika hadi ukubali."]],
                [["Payments", "/app/finance/payments"], ["Money in from customers, with the receipt issued for it.", "Pesa zilizoingia kutoka kwa wateja, pamoja na risiti iliyotolewa."]],
                [["Pickup notes", "/app/finance/pickup-notes"], ["The warehouse's authority to hand cargo over. You issue; everyone else prints.", "Kibali cha ghala kukabidhi mzigo. Wewe unatoa; wengine wanachapisha tu."]],
                [["Collections", "/app/collections"], ["What customers owe and who to ring, oldest first.", "Wateja wanadaiwa nini na nani wa kupigiwa, wakianza wa zamani."]],
                [["Accounts", "/app/finance/accounts"], ["Where the company's money sits. Every figure derived, nothing typed.", "Pesa za kampuni zilipo. Kila takwimu imehesabiwa, hakuna iliyoandikwa kwa mkono."]],
                [["The Ledger", "/app/finance/transactions"], ["Every movement of money, with a running balance.", "Kila mwendo wa pesa, pamoja na salio linaloendelea."]],
                [["Expenses", "/app/finance/expenses"], ["What the business spends, and what it has already paid.", "Kampuni inatumia nini, na imeshalipa nini."]],
                [["Pricing", "/app/finance/pricing"], ["The rate book. Change a figure here and the whole system follows.", "Kitabu cha bei. Badilisha takwimu hapa na mfumo mzima unafuata."]],
                [["Audit", "/app/finance/audit"], ["Every money action, who did it and when. Append-only.", "Kila kitendo cha pesa, nani alifanya na lini. Haiwezi kufutwa."]],
              ],
            },
          ],
        },
      ],
    },

    {
      title: ["Every screen in detail", "Kila ukurasa kwa kina"],
      blurb: ["The picture, every control, and why it is there.", "Picha, kila kitufe, na sababu ya kuwepo kwake."],
      pages: [
        {
          kind: "screen",
          title: ["Verify payments — the load-bearing screen", "Thibitisha malipo — ukurasa muhimu zaidi"],
          eyebrow: "Nothing settles without you",
          route: "/app/finance/verify",
          intro: [
            "Claims Customer Care has collected from customers. Open the claim, check the proof against the account the money should have landed in, then Verify or Reject. Rejecting sends it back with your reason; it does not delete anything.",
            "Madai ya Huduma kwa Wateja kuwa wamekusanya kutoka kwa wateja. Fungua dai, kagua ushahidi dhidi ya akaunti pesa ilipopaswa kuingia, kisha Thibitisha au Kataa. Kukataa kunarudisha dai pamoja na sababu yako; hakuna kinachofutwa.",
          ],
          figure: { shot: "verify-payments-hero", crop: true },
          keys: [
            { n: 1, title: ["The claimed amount", "Kiasi kinachodaiwa"], body: ["What the customer says they sent.", "Kiasi mteja anachosema alituma."] },
            { n: 2, title: ["Into which account", "Kwenye akaunti gani"], body: ["The account the money should have landed in. This is the field that matters most.", "Akaunti pesa ilipopaswa kuingia. Hii ndiyo sehemu muhimu zaidi."] },
            { n: 3, title: ["The proof", "Ushahidi"], body: ["The screenshot or slip the customer sent. Open it — do not verify from the amount alone.", "Picha au risiti mteja aliyotuma. Ifungue — usithibitishe kwa kuangalia kiasi pekee."] },
          ],
          callout: {
            kind: "stop",
            text: [
              "*Match the proof to the account.* A screenshot showing the right figure paid into the wrong account is the most common way money goes missing.",
              "*Linganisha ushahidi na akaunti.* Picha inayoonyesha kiasi sahihi lakini kilipwa akaunti isiyo sahihi ndiyo njia ya kawaida pesa inavyopotea.",
            ],
          },
        },
        {
          kind: "screen",
          title: ["Pickup notes — the most important thing you do", "Hati za kuchukua — kazi yako muhimu zaidi"],
          eyebrow: "Cargo moves when you say so",
          route: "/app/finance/pickup-notes",
          intro: [
            "Until the note exists, the counter physically cannot release the boxes — it scans the carton and the screen refuses. Issue it the moment an invoice settles.",
            "Hadi hati itakapokuwepo, kaunta haiwezi kabisa kukabidhi mizigo — inaskani boksi na skrini inakataa. Itoe mara tu ankara inapolipwa.",
          ],
          figure: { shot: "pickup-notes-hero", crop: true },
          callout: {
            kind: "warn",
            text: [
              "A customer standing at the counter with money already paid, waiting on a note nobody issued, is the one failure they will remember.",
              "Mteja aliyesimama kaunta akiwa amelipa, akisubiri hati ambayo hakuna aliyeitoa — hilo ndilo kosa atakalolikumbuka.",
            ],
          },
        },
        {
          kind: "screen",
          title: ["Collections — chasing what is owed", "Ukusanyaji — kufuatilia madeni"],
          eyebrow: "Oldest first",
          route: "/app/collections",
          intro: [
            "Everything unpaid, oldest first, with a phone number beside it. The oldest debt is the one least likely to ever be collected, so work down from the top.",
            "Kila kisicholipwa, kikianza cha zamani, na namba ya simu kando yake. Deni kongwe ndilo lenye nafasi ndogo zaidi ya kukusanywa, hivyo anza kutoka juu.",
          ],
          figure: { shot: "collections-hero", crop: true },
          callout: {
            kind: "warn",
            text: [
              "Cargo under investigation appears here too. *Do not chase payment on a consignment the warehouse is still looking for* — check Issues & Claims first.",
              "Mizigo iliyo kwenye uchunguzi pia inaonekana hapa. *Usifuatilie malipo ya mzigo ambao ghala bado wanautafuta* — kagua Matatizo na Madai kwanza.",
            ],
          },
        },
        {
          kind: "screen",
          title: ["Accounts & the Ledger", "Akaunti na Daftari"],
          eyebrow: "Where the money sits",
          route: "/app/finance/accounts · /app/finance/transactions",
          intro: [
            "Accounts shows where the company's money sits; the Ledger shows every movement with a running balance. Every figure is derived from recorded movements — *nothing here is typed*, so the books cannot quietly drift away from the record.",
            "Akaunti inaonyesha pesa za kampuni zilipo; Daftari linaonyesha kila mwendo pamoja na salio linaloendelea. Kila takwimu imehesabiwa kutoka miamala iliyorekodiwa — *hakuna iliyoandikwa kwa mkono*, hivyo vitabu haviwezi kutofautiana kimyakimya na kumbukumbu.",
          ],
          figure: { shot: "accounts-hero", crop: true },
        },
        {
          kind: "screen",
          title: ["Pricing & Audit", "Bei na Ukaguzi"],
          eyebrow: "The rate book, and the record",
          route: "/app/finance/pricing · /app/finance/audit",
          intro: [
            "Every figure this business quotes comes from the Pricing page. Change it there and cargo, invoices, tracking and reports all follow. Audit is every money action on the system, append-only — nothing here can be edited or removed, including by the CEO.",
            "Kila kiasi kampuni inachotaja kinatoka ukurasa wa Bei. Kibadilishe hapo na mizigo, ankara, ufuatiliaji na ripoti vyote vinafuata. Ukaguzi ni kila kitendo cha pesa kwenye mfumo, na huongezwa tu — hakuna kinachoweza kuhaririwa au kufutwa, hata na Mkurugenzi.",
          ],
          figure: { shot: "pricing-hero", crop: true },
          callout: {
            kind: "tip",
            text: [
              "The rate book carries a *1 kg minimum billable weight*. Anything lighter is charged as a kilo, and the quote tells the customer exactly that.",
              "Kitabu cha bei kina *uzito wa chini wa kutozwa wa kilo 1*. Chochote chepesi zaidi hutozwa kama kilo moja, na nukuu inamweleza mteja hivyo hasa.",
            ],
          },
        },
      ],
    },

    {
      title: ["The complete journey", "Safari kamili"],
      blurb: ["Where your part sits in the whole chain.", "Sehemu yako iko wapi kwenye mnyororo mzima."],
      pages: [
        {
          title: ["Fifteen steps, five departments", "Hatua kumi na tano, vitengo vitano"],
          eyebrow: "End to end",
          blocks: [
            {
              type: "flow",
              steps: [
                { who: "Guangzhou", what: ["Cargo registered and labelled", "Mzigo unasajiliwa na kuwekewa lebo"], tone: "draft" },
                { who: "Guangzhou", what: ["Sealed and flown", "Kundi linafungwa na kusafirishwa"], tone: "draft" },
                { who: "Dar floor", what: ["Checked in against the manifest", "Unakaguliwa kwa orodha ya mizigo"], tone: "owed" },
                { who: "System", what: ["Priced automatically as a DRAFT", "Unapangiwa bei kiotomatiki kama RASIMU"], tone: "owed",
                  note: ["A draft owes nobody anything.", "Rasimu haimdai mtu chochote."] },
                { who: "You", what: ["Confirm the price", "Thibitisha bei"], tone: "info",
                  note: ["Recalculates storage days and today's rate. Now it is a bill.", "Inahesabu upya siku za uhifadhi na kiwango cha leo. Sasa ni ankara."] },
                { who: "Customer Care", what: ["Ring the customer", "Mpigie mteja simu"], tone: "info" },
                { who: "Customer", what: ["Pays", "Analipa"], tone: "info" },
                { who: "Customer Care", what: ["Submit the claim with proof", "Wasilisha dai pamoja na ushahidi"], tone: "info",
                  note: ["A claim is not money.", "Dai siyo pesa."] },
                { who: "You", what: ["Verify the payment", "Thibitisha malipo"], tone: "paid",
                  note: ["Receipt numbered, ledger posted.", "Risiti inapewa namba, daftari linaandikwa."] },
                { who: "You", what: ["Issue the pickup note", "Toa hati ya kuchukua"], tone: "paid" },
                { who: "Dar floor", what: ["Scan · photograph · hand over", "Skani · piga picha · kabidhi"], tone: "paid" },
              ],
            },
          ],
        },
      ],
    },

    {
      title: ["A worked example", "Mfano wa vitendo"],
      blurb: ["One bill, from draft to collected.", "Ankara moja, kutoka rasimu hadi kukusanywa."],
      pages: [
        {
          title: ["TX-000042 · shoes for John Peter", "TX-000042 · viatu vya John Peter"],
          eyebrow: "Follow the money",
          blocks: [
            {
              type: "example",
              fields: [
                { k: "Customer", v: "John Peter" },
                { k: "Tracking", v: "TX-000042" },
                { k: "Weight", v: "3.6 kg" },
                { k: "Freight", v: "USD 48.60" },
              ],
            },
            {
              type: "table",
              head: ["Stage", "What you do"],
              rows: [
                [["Draft appears", "Rasimu inatokea"], ["Dar checks the cargo in. The system prices it: 3.6 kg × USD 13.50 = USD 48.60, as a DRAFT.", "Dar wanakagua mzigo. Mfumo unapanga bei: kilo 3.6 × USD 13.50 = USD 48.60, kama RASIMU."]],
                [["You confirm", "Unathibitisha"], ["You press Confirm. Storage days are counted to today and the rate frozen. It becomes invoice INV-2026-000042, UNPAID.", "Unabonyeza Thibitisha. Siku za uhifadhi zinahesabiwa hadi leo na kiwango kinagandishwa. Inakuwa ankara INV-2026-000042, HAIJALIPWA."]],
                [["Customer pays", "Mteja analipa"], ["John sends USD 48.60 by M-Pesa. Customer Care submits the claim with his screenshot.", "John anatuma USD 48.60 kwa M-Pesa. Huduma kwa Wateja wanawasilisha dai pamoja na picha yake."]],
                [["You verify", "Unathibitisha"], ["You open the proof, match it to the M-Pesa account, and press Verify. A receipt is numbered and the ledger is posted.", "Unafungua ushahidi, unaulinganisha na akaunti ya M-Pesa, na kubonyeza Thibitisha. Risiti inapewa namba na daftari linaandikwa."]],
                [["You issue the note", "Unatoa hati"], ["The bill is settled, so you issue PN-2026-000042. The cargo flips to Ready for pickup.", "Ankara imelipwa, hivyo unatoa PN-2026-000042. Mzigo unakuwa Tayari kuchukuliwa."]],
                [["Collected", "Umechukuliwa"], ["John collects. Your part is done, and every step above is on the audit log with your name.", "John anachukua. Kazi yako imekwisha, na kila hatua iko kwenye daftari la ukaguzi na jina lako."]],
              ],
            },
          ],
        },
      ],
    },

    {
      title: ["When things go wrong", "Mambo yanapoharibika"],
      blurb: ["The mistakes that actually happen here.", "Makosa yanayotokea hapa kweli."],
      pages: [
        {
          title: ["Common mistakes", "Makosa ya kawaida"],
          eyebrow: "Fix it this way",
          blocks: [
            {
              type: "table",
              head: ["The mistake", "What it causes", "What to do"],
              rows: [
                [["Leaving prices as drafts for weeks", "Kuacha bei kama rasimu kwa wiki"], ["Storage days keep counting, so the customer is billed for a delay that was yours.", "Siku za uhifadhi zinaendelea kuhesabiwa, hivyo mteja anatozwa kwa ucheleweshaji wako."], ["Confirm the batch the day it lands.", "Thibitisha kundi siku linapofika."]],
                [["Verifying from the amount alone", "Kuthibitisha kwa kuangalia kiasi pekee"], ["Money credited against an account it never reached.", "Pesa inahesabiwa kwenye akaunti ambayo haikuifikia."], ["Open the proof and match the receiving account.", "Fungua ushahidi na ulinganishe akaunti iliyopokea."]],
                [["Forgetting to issue the pickup note", "Kusahau kutoa hati ya kuchukua"], ["A customer who has paid is turned away at the counter.", "Mteja aliyelipa anarudishwa kaunta."], ["Issue it the moment the invoice settles.", "Itoe mara tu ankara inapolipwa."]],
                [["Recording a payment without naming the account", "Kuandika malipo bila kutaja akaunti"], ["A figure no bank statement will ever match.", "Takwimu ambayo hakuna taarifa ya benki itakayolingana nayo."], ["Always pick the receiving account.", "Daima chagua akaunti iliyopokea."]],
                [["Chasing a customer whose cargo is under investigation", "Kufuatilia mteja ambaye mzigo wake uko kwenye uchunguzi"], ["You demand money for a box the warehouse cannot find.", "Unadai pesa kwa boksi ambalo ghala haliwezi kulipata."], ["Check Issues & Claims before ringing.", "Kagua Matatizo na Madai kabla ya kupiga simu."]],
              ],
            },
          ],
        },
      ],
    },

    {
      title: ["Working well", "Kufanya kazi vizuri"],
      blurb: ["Habits that keep the books honest.", "Tabia zinazoweka vitabu vikiwa sahihi."],
      pages: [
        {
          title: ["Best practice", "Mbinu bora"],
          eyebrow: "Do it this way",
          blocks: [
            {
              type: "cards",
              columns: 2,
              items: [
                { label: "Drafts", title: ["Confirm the day it lands", "Thibitisha siku inapofika"], body: ["Confirming recalculates storage. A bill confirmed three weeks late charges three weeks of storage.", "Kuthibitisha kunahesabu upya uhifadhi. Ankara iliyothibitishwa wiki tatu baadaye inatoza uhifadhi wa wiki tatu."] },
                { label: "Proof", title: ["Open every attachment", "Fungua kila kiambatisho"], body: ["The account matters more than the amount.", "Akaunti ni muhimu zaidi kuliko kiasi."] },
                { label: "Notes", title: ["Issue the moment it settles", "Toa mara tu inapolipwa"], body: ["The customer may already be on their way to the counter.", "Mteja anaweza kuwa tayari yuko njiani kuelekea kaunta."] },
                { label: "Accounts", title: ["Always name where it landed", "Daima taja pesa ilipoingia"], body: ["Every figure on Accounts is derived from these entries.", "Kila takwimu kwenye Akaunti inatokana na maandishi haya."] },
                { label: "Chasing", title: ["Oldest first, always", "Kongwe kwanza, daima"], body: ["The oldest debt is the least likely to be collected.", "Deni kongwe ndilo lenye nafasi ndogo ya kukusanywa."] },
                { label: "Refusals", title: ["A refusal is a warning", "Kukataliwa ni onyo"], body: ["If the system stops you, the numbers disagree. Do not look for a way around it.", "Mfumo ukikuzuia, takwimu hazikubaliani. Usitafute njia ya kuzunguka."] },
              ],
            },
          ],
        },
      ],
    },

    {
      title: ["Questions people ask", "Maswali yanayoulizwa"],
      blurb: ["The ones that come up in the first week.", "Yale yanayojitokeza wiki ya kwanza."],
      pages: [
        {
          title: ["Frequently asked", "Maswali ya mara kwa mara"],
          eyebrow: "FAQ",
          blocks: [
            {
              type: "table",
              head: ["Question", "Answer"],
              rows: [
                [["Can I edit an invoice after payment?", "Naweza kuhariri ankara baada ya malipo?"], ["No. Once any money has landed against it, it is closed to changes. Correct it before the first payment, or raise the difference separately.", "Hapana. Pesa yoyote ikishaingia, haiwezi kubadilishwa. Irekebishe kabla ya malipo ya kwanza, au dai tofauti kivyake."]],
                [["The system refuses an overpayment.", "Mfumo unakataa malipo ya ziada."], ["Correct. It refuses rather than quietly creating a credit nobody asked for. Check the numbers.", "Ni sahihi. Unakataa badala ya kuunda salio ambalo hakuna aliyeliomba. Kagua takwimu."]],
                [["A customer paid in shillings but the invoice is in dollars.", "Mteja alilipa kwa shilingi lakini ankara ni ya dola."], ["That is normal. The system converts at the rate frozen onto that invoice, so the figure can be re-explained months later.", "Ni kawaida. Mfumo unabadilisha kwa kiwango kilichogandishwa kwenye ankara hiyo, ili takwimu ieleweke hata miezi baadaye."]],
                [["Can I cancel a pickup note?", "Naweza kufuta hati ya kuchukua?"], ["Yes, but only before the cargo is collected. After handover the record stands.", "Ndiyo, lakini kabla mzigo haujachukuliwa. Baada ya makabidhiano kumbukumbu inabaki."]],
                [["Why can the warehouse not see the amount?", "Kwa nini ghala hawaoni kiasi?"], ["They get the payment fact, never the figure. The figure is yours to defend.", "Wanapata taarifa kuwa imelipwa, siyo kiasi. Kiasi ni jukumu lako kukitetea."]],
              ],
            },
          ],
        },
      ],
    },

    {
      title: ["Summary", "Muhtasari"],
      blurb: ["Three moves are the whole job.", "Hatua tatu ndizo kazi nzima."],
      pages: [
        {
          title: ["The money desk in one page", "Kitengo cha fedha kwa ukurasa mmoja"],
          eyebrow: "Keep this one",
          blocks: [
            {
              type: "cards",
              columns: 3,
              items: [
                { label: "1", title: ["Confirm the price", "Thibitisha bei"], body: ["A draft owes nobody anything. Confirm it and the business is owed money.", "Rasimu haimdai mtu. Ithibitishe na kampuni inakuwa inadai."] },
                { label: "2", title: ["Verify the payment", "Thibitisha malipo"], body: ["Match the proof to the account. Until you agree, the money does not exist.", "Linganisha ushahidi na akaunti. Hadi ukubali, pesa hiyo haipo."] },
                { label: "3", title: ["Issue the note", "Toa hati"], body: ["The moment the bill is settled. Until it exists, the cargo cannot move.", "Mara tu ankara inapolipwa. Hadi iwepo, mzigo hauwezi kutoka."] },
              ],
            },
            {
              type: "callout",
              kind: "tip",
              label: "If you remember one sentence",
              text: [
                "In that order, every day. Everything else on your menu is there to explain a number after somebody asks about it.",
                "Kwa mpangilio huo, kila siku. Kila kitu kingine kwenye menyu yako kipo ili kueleza takwimu baada ya mtu kuuliza.",
              ],
            },
          ],
        },
      ],
    },
  ],
};
