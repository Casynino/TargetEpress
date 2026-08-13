/**
 * Customer Care — staff training manual. English + Kiswahili.
 */

export default {
  department: ["Customer Care", "Huduma kwa Wateja"],
  version: "1.0",
  labels: {
    version: ["Version", "Toleo"],
    languages: ["Languages", "Lugha"],
    audience: ["For", "Kwa"],
    issued: ["Issued", "Imetolewa"],
  },
  languages: "English · Kiswahili",
  audience: "Customer Care desk",
  issued: "August 2026",
  contentsAlt: "Yaliyomo",

  callouts: {
    stop: ["Never do this", "Usifanye hivi"],
    warn: ["Careful", "Kuwa makini"],
    tip: ["Tip", "Kidokezo"],
    note: ["Note", "Kumbuka"],
  },

  sections: [
    {
      title: ["Welcome to the customer desk", "Karibu kwenye kitengo cha wateja"],
      blurb: [
        "You are the voice of this business. What you never do is decide that money arrived — and the whole department is built around that one line.",
        "Wewe ndiye sauti ya kampuni hii. Kitu usichofanya kamwe ni kuamua kuwa pesa imefika — na kitengo kizima kimejengwa kuzunguka msingi huo mmoja.",
      ],
      pages: [
        {
          title: ["What this desk is, and what it is not", "Kitengo hiki ni nini, na si nini"],
          eyebrow: ["Mission", "Dhamira"],
          blocks: [
            {
              type: "cards",
              columns: 2,
              items: [
                {
                  label: ["You may say", "Unaweza kusema"],
                  title: ["“The customer says they have paid”", "“Mteja anasema amelipa”"],
                  body: [
                    "You take the claim, attach their evidence, and hand it up to Finance. A submission moves no money: it writes nothing to the invoice, nothing to the ledger, nothing to any balance. *A claim is not money.*",
                    "Unapokea dai, unaambatisha ushahidi wake, na kulipeleka kwa Fedha. Uwasilishaji hauhamishi pesa: hauandiki chochote kwenye ankara, daftari, wala salio lolote. *Dai siyo pesa.*",
                  ],
                },
                {
                  label: ["You may not say", "Huwezi kusema"],
                  title: ["“The money arrived”", "“Pesa imefika”"],
                  body: [
                    "Only Finance can. That single denial is why this desk can ring customers all day without ever being able to release cargo or move a figure — and why nobody can pressure you into doing it.",
                    "Ni Fedha pekee wanaoweza. Kukatazwa huko ndiko kunakofanya kitengo hiki kiweze kupiga simu kwa wateja siku nzima bila kuweza kutoa mzigo au kuhamisha takwimu — na ndiyo maana hakuna anayeweza kukushinikiza kufanya hivyo.",
                  ],
                },
              ],
            },
            {
              type: "table",
              head: [["Your day", "Siku yako"], ["What it means", "Maana yake"]],
              rows: [
                [["Land on your desk", "Fika kwenye kitengo chako"], ["/app/support is your dashboard. There is no second one.", "/app/support ndio ukurasa wako. Hakuna mwingine."]],
                [["Read what needs you", "Soma kinachohitaji uangalizi"], ["One panel, already sorted by urgency. Work it top to bottom.", "Paneli moja, imepangwa kwa udharura. Anza juu hadi chini."]],
                [["Clear rejections first", "Anza na yaliyorudishwa"], ["Anything Finance sent back is a customer waiting on you.", "Chochote Fedha walichorudisha ni mteja anayekusubiri."]],
                [["Work the call list", "Fanyia kazi orodha ya simu"], ["Read the Next action column before you dial.", "Soma safu ya Hatua Inayofuata kabla ya kupiga simu."]],
                [["Take their proof", "Chukua ushahidi wao"], ["A reference on its own is not evidence. Attach the file.", "Namba ya kumbukumbu pekee siyo ushahidi. Ambatisha faili."]],
                [["Tell them to collect", "Waambie waje kuchukua"], ["Only once the pickup note actually exists.", "Tu baada ya hati ya kuchukua kuwepo kweli."]],
              ],
            },
          ],
        },
        {
          title: ["What you may and may not do", "Unachoweza na usichoweza"],
          eyebrow: ["Authority", "Mamlaka"],
          blocks: [
            {
              type: "cards",
              columns: 2,
              items: [
                {
                  label: ["You may", "Unaweza"],
                  title: ["Talk, bill, chase, record", "Kuongea, kutoza, kufuatilia, kuandika"],
                  body: [
                    "See every consignment and what the customer owes · bill a customer and edit an invoice · chase with a pre-written Swahili reminder on WhatsApp · take a payment claim with evidence · print a pickup note Finance already issued · open and close tickets and sourcing requests · quote from the rate book.",
                    "Kuona kila mzigo na deni la mteja · kutoza mteja na kuhariri ankara · kufuatilia kwa ujumbe wa Kiswahili ulioandaliwa kwenye WhatsApp · kuchukua dai la malipo pamoja na ushahidi · kuchapisha hati ya kuchukua iliyotolewa na Fedha · kufungua na kufunga tiketi na maombi ya kutafuta bidhaa · kunukuu kutoka kitabu cha bei.",
                  ],
                },
                {
                  label: ["You may not", "Huwezi"],
                  title: ["Confirm money, issue notes, discount", "Kuthibitisha pesa, kutoa hati, kupunguza bei"],
                  body: [
                    "Say money arrived · verify your own submission · issue or cancel a pickup note · give a discount · open the company's books — accounts, ledger, costs, profit · touch the cargo: no registering, scanning, receiving or releasing.",
                    "Kusema pesa imefika · kuthibitisha uwasilishaji wako mwenyewe · kutoa au kufuta hati ya kuchukua · kutoa punguzo · kufungua vitabu vya kampuni — akaunti, daftari, gharama, faida · kugusa mzigo: hakuna kusajili, kuskani, kupokea wala kukabidhi.",
                  ],
                },
              ],
            },
            {
              type: "callout",
              kind: "stop",
              label: ["The one that protects you", "Hili linakulinda"],
              text: [
                "*Never tell a customer their cargo is released until the pickup note actually exists.* A customer sent to the warehouse too early is turned away at the counter — and it is your name they remember.",
                "*Usimwambie mteja mzigo wake umeruhusiwa hadi hati ya kuchukua iwepo kweli.* Mteja aliyetumwa ghalani mapema mno anarudishwa kaunta — na jina lako ndilo atakalolikumbuka.",
              ],
            },
          ],
        },
      ],
    },

    {
      title: ["Signing in", "Kuingia kwenye mfumo"],
      blurb: ["One address, one account, and your desk is the home page.", "Anwani moja, akaunti moja, na kitengo chako ndio ukurasa wa mwanzo."],
      pages: [
        {
          kind: "screen",
          title: ["The login screen", "Ukurasa wa kuingia"],
          eyebrow: ["Step 1", "Hatua ya 1"],
          route: "target-epress.vercel.app",
          intro: [
            "Type your work email and password. Everyone signs in at the same door, and the system sends you straight to the support desk. If you bookmarked a dashboard from another role it still works — it simply redirects back here.",
            "Andika barua pepe yako ya kazi na nenosiri. Kila mtu anaingia mlango mmoja, na mfumo unakupeleka moja kwa moja kwenye kitengo cha huduma. Kama uliweka alama ya ukurasa wa kitengo kingine bado unafanya kazi — unarudi hapa tu.",
          ],
          figure: {
            shot: "login",
            crop: true,
            pins: [
              { n: 1, x: 78, y: 48 },
              { n: 2, x: 78, y: 58 },
              { n: 3, x: 78, y: 65 },
            ],
          },
          keys: [
            { n: 1, title: ["Email", "Barua pepe"], body: ["e.g. support@targetexpress.co.tz", "mfano support@targetexpress.co.tz"] },
            { n: 2, title: ["Password", "Nenosiri"], body: ["Change it from Profile once you are in.", "Ibadilishe kwenye Wasifu baada ya kuingia."] },
            { n: 3, title: ["Sign in", "Ingia"], body: ["Straight to /app/support — your desk IS the dashboard.", "Moja kwa moja hadi /app/support — kitengo chako NDIO ukurasa wa mwanzo."] },
          ],
          callout: {
            kind: "tip",
            label: ["Tip", "Kidokezo"],
            text: [
              "Do not go looking for a second dashboard. There isn't one, and that is deliberate — everything this desk does starts on one page.",
              "Usitafute ukurasa mwingine wa mwanzo. Haupo, na hiyo ni kwa makusudi — kila kitu kitengo hiki kinachofanya kinaanzia ukurasa mmoja.",
            ],
          },
        },
      ],
    },

    {
      title: ["Your home screen", "Ukurasa wako wa mwanzo"],
      blurb: ["One panel, already sorted by what costs the business most.", "Paneli moja, tayari imepangwa kwa hasara kubwa kwa kampuni."],
      pages: [
        {
          kind: "screen",
          title: ["Home, section by section", "Ukurasa wa mwanzo, sehemu kwa sehemu"],
          eyebrow: ["Dashboard", "Ukurasa wa mwanzo"],
          route: "/app/support",
          intro: [
            "Search at the top, then Needs your attention, then the tiles and the call list. Work the panel in the order it gives you — it is not alphabetical, it is ordered by urgency.",
            "Utafutaji juu, kisha Yanayohitaji uangalizi wako, kisha vipimo na orodha ya simu. Fanyia kazi paneli kwa mpangilio inavyokupa — siyo wa alfabeti, ni wa udharura.",
          ],
          figure: {
            shot: "home-hero",
            crop: true,
            pins: [{ n: 1, x: 50, y: 20 }, { n: 2, x: 55, y: 42 }, { n: 3, x: 55, y: 72 }, { n: 4, x: 10, y: 35 }],
          },
          keys: [
            {
              n: 1,
              title: ["The search box", "Kisanduku cha utafutaji"],
              body: [
                "Tracking number, customer name, the number they are calling from, a batch or an invoice. Whatever the caller has, type it here.",
                "Namba ya ufuatiliaji, jina la mteja, namba anayopigia, kundi au ankara. Chochote mpigaji alicho nacho, kiandike hapa.",
              ],
            },
            {
              n: 2,
              title: ["Needs your attention", "Yanayohitaji uangalizi wako"],
              body: [
                "Urgent tickets, customers to chase, payments Finance sent back, claims still waiting, cases parked on a customer's answer.",
                "Tiketi za dharura, wateja wa kufuatilia, malipo Fedha waliyorudisha, madai yanayosubiri, kesi zinazosubiri jibu la mteja.",
              ],
            },
            {
              n: 3,
              title: ["The call list preview", "Muhtasari wa orodha ya simu"],
              body: [
                "The top six customers to ring. The full queue is one press away.",
                "Wateja sita wa kwanza wa kupigiwa. Orodha kamili iko bonyezo moja tu.",
              ],
            },
            {
              n: 4,
              title: ["The sidebar", "Menyu ya kando"],
              body: ["Everything you can reach, grouped by the kind of work.", "Kila ukurasa unaoweza kufikia, umepangwa kwa aina ya kazi."],
            },
          ],
          callout: {
            kind: "tip",
            label: ["Tip", "Kidokezo"],
            text: [
              "When the panel is empty it says so: *“Nothing is waiting on you. Every landed consignment is billed and no customer is owed a call.”* That is a real state, not a screen that failed to load.",
              "Paneli ikiwa tupu inasema hivyo: *“Hakuna kinachokusubiri. Kila mzigo uliofika umetozwa na hakuna mteja anayedai simu.”* Hiyo ni hali halisi, siyo ukurasa ulioshindwa kupakia.",
            ],
          },
        },
      ],
    },

    {
      title: ["The sidebar, menu by menu", "Menyu ya kando, moja baada ya nyingine"],
      blurb: ["Twelve doors, and when to be in each.", "Milango kumi na miwili, na wakati wa kutumia kila mmoja."],
      pages: [
        {
          title: ["Every menu explained", "Kila menyu imeelezwa"],
          eyebrow: ["Navigation", "Uelekezi"],
          blocks: [
            {
              type: "table",
              head: [["Menu", "Menyu"], ["What it is, and when to use it", "Ni nini, na lini kuitumia"]],
              rows: [
                [["Home", "/app/support"], ["Your desk and the attention panel. Start and end here.", "Kitengo chako na paneli ya matukio. Anza na malizia hapa."]],
                [["Search", "/app/search"], ["Any consignment, by tracking number, customer, phone or description.", "Mzigo wowote, kwa namba ya ufuatiliaji, mteja, simu au maelezo."]],
                [["Customers", "/app/customers"], ["The customer book — history, contact details, everything they have shipped.", "Kitabu cha wateja — historia, mawasiliano, kila walichosafirisha."]],
                [["Shipments · Batches", "/app/shipments"], ["Where a consignment is, and which flight it came on.", "Mzigo uko wapi, na ulikuja kwa ndege gani."]],
                [["Collections", "/app/collections"], ["What is owed, who to ring, what you handed up and what came back.", "Kinachodaiwa, nani wa kupigia, ulichowasilisha na kilichorudi."]],
                [["Pickup notes", "/app/finance/pickup-notes"], ["Notes Finance has issued. You print them; you never create one.", "Hati zilizotolewa na Fedha. Unazichapisha; huwezi kuunda."]],
                [["Price Configuration", "/app/finance/pricing"], ["The rate book. Read a quote off this, never from memory.", "Kitabu cha bei. Soma nukuu hapa, siyo kwa kumbukumbu."]],
                [["Tickets", "/app/support/tickets"], ["Calls, complaints and enquiries, with the resolution written down.", "Simu, malalamiko na maswali, pamoja na suluhisho lililoandikwa."]],
                [["Issues & Claims", "/app/exceptions"], ["Cargo under investigation. Ring the ones parked on the customer.", "Mizigo iliyo kwenye uchunguzi. Piga simu kwa zinazosubiri mteja."]],
                [["Sourcing requests", "/app/support/sourcing"], ["Customers asking us to find goods in China, on a board.", "Wateja wanaotuomba tuwatafutie bidhaa China, kwenye ubao."]],
                [["China markets", "/app/support/markets"], ["Which Guangzhou market sells what, so you can point them properly.", "Soko gani la Guangzhou linauza nini, ili uwaelekeze vizuri."]],
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
          title: ["Collections — the call list", "Ukusanyaji — orodha ya simu"],
          eyebrow: ["Where most of your day goes", "Sehemu kubwa ya siku yako"],
          route: "/app/collections/follow-up",
          intro: [
            "Every consignment sitting in Dar that is already billed and not yet paid, with a phone number on the row. Read the *Next action* column before you dial — a row that says “Confirm the price” means the invoice is still a draft.",
            "Kila mzigo uliopo Dar ambao umeshatozwa na haujalipwa, na namba ya simu kwenye mstari. Soma safu ya *Hatua Inayofuata* kabla ya kupiga — mstari unaosema “Thibitisha bei” maana yake ankara bado ni rasimu.",
          ],
          figure: { shot: "follow-up-hero", crop: true },
          keys: [
            {
              n: 1,
              title: ["The band totals", "Jumla za juu"],
              body: [
                "A live estimate at today's rate. *Quote the row, never the band* — the row is the exact figure the customer was given.",
                "Makadirio ya sasa kwa kiwango cha leo. *Nukuu mstari, siyo jumla ya juu* — mstari ndio kiasi hasa alichopewa mteja.",
              ],
            },
            {
              n: 2,
              title: ["The WhatsApp icon", "Alama ya WhatsApp"],
              body: [
                "The Swahili reminder is already written: name, tracking number, goods, invoice, weight, amount in shillings and where to pay.",
                "Ujumbe wa Kiswahili umeshaandikwa: jina, namba ya ufuatiliaji, bidhaa, ankara, uzito, kiasi kwa shilingi na mahali pa kulipa.",
              ],
            },
            {
              n: 3,
              title: ["Next action", "Hatua inayofuata"],
              body: [
                "Tells you what this row actually needs. Read it first and you will never quote a figure the business has not agreed.",
                "Inakuambia mstari huu unahitaji nini hasa. Isome kwanza na hutawahi kunukuu kiasi ambacho kampuni haijakubali.",
              ],
            },
          ],
          callout: {
            kind: "stop",
            label: ["Never do this", "Usifanye hivi kamwe"],
            text: [
              "*Never quote a draft.* A draft is the system's price, not a bill. Asking a customer for a figure this business has not yet agreed to is how a quote becomes an argument.",
              "*Usinukuu rasimu kamwe.* Rasimu ni bei ya mfumo, siyo ankara. Kumwomba mteja kiasi ambacho kampuni haijakubali ndiko kunakogeuza nukuu kuwa ugomvi.",
            ],
          },
        },
        {
          kind: "screen",
          title: ["Recording a payment claim", "Kuandika dai la malipo"],
          eyebrow: ["Hand it up to Finance", "Wasilisha kwa Fedha"],
          route: "/app/collections/record",
          intro: [
            "When a customer says they have paid, open the payment icon on their row. Everything except the reference and the attachment is filled in for you. You must attach evidence — Finance cannot verify a reference on its own.",
            "Mteja anaposema amelipa, fungua alama ya malipo kwenye mstari wake. Kila kitu isipokuwa namba ya kumbukumbu na kiambatisho kimeshajazwa. Lazima uambatishe ushahidi — Fedha hawawezi kuthibitisha namba peke yake.",
          ],
          figure: { shot: "collections-hero", crop: true },
          keys: [
            { n: 1, title: ["The reference", "Namba ya kumbukumbu"], body: ["The M-Pesa or bank reference the customer gives you.", "Namba ya M-Pesa au benki mteja anayokupa."] },
            { n: 2, title: ["The attachment", "Kiambatisho"], body: ["A screenshot or slip. Required — a reference alone is refused.", "Picha au risiti. Ni lazima — namba peke yake inakataliwa."] },
            { n: 3, title: ["Hand up to Finance", "Wasilisha kwa Fedha"], body: ["This moves no money. Finance rules on it, and only then does anything settle.", "Hii haihamishi pesa. Fedha wanaamua, na hapo tu ndipo kitu kinakamilika."] },
          ],
          callout: {
            kind: "warn",
            label: ["Careful", "Kuwa makini"],
            text: [
              "An iPhone HEIC photo is refused, because Finance must be able to open it. Ask for a screenshot, or have the customer set Camera → Formats to *Most Compatible*. And note: *one pending claim per bill* — a second is refused by name.",
              "Picha ya HEIC ya iPhone inakataliwa, kwa sababu Fedha lazima waweze kuifungua. Omba picha ya skrini, au mteja abadilishe Kamera → Miundo kuwa *Most Compatible*. Pia: *dai moja tu linalosubiri kwa kila ankara* — la pili linakataliwa kwa jina.",
            ],
          },
        },
        {
          kind: "screen",
          title: ["Tickets — every call written down", "Tiketi — kila simu imeandikwa"],
          eyebrow: ["The record of a conversation", "Kumbukumbu ya mazungumzo"],
          route: "/app/support/tickets",
          intro: [
            "Take calls, complaints and price enquiries as tickets. A customer link is optional — price enquiries arrive before people are customers — but a name or a phone number is required.",
            "Pokea simu, malalamiko na maswali ya bei kama tiketi. Kumuunganisha mteja siyo lazima — maswali ya bei huja kabla watu hawajawa wateja — lakini jina au namba ya simu ni lazima.",
          ],
          figure: { shot: "tickets-hero", crop: true },
          callout: {
            kind: "tip",
            label: ["Tip", "Kidokezo"],
            text: [
              "You cannot close a ticket without writing what you did. *Internal notes are never shown to the customer* — write freely, so the next person picking up the call knows exactly where it got to.",
              "Huwezi kufunga tiketi bila kuandika ulichofanya. *Maelezo ya ndani hayaonyeshwi kwa mteja* — andika bila wasiwasi, ili atakayeshika simu ijayo ajue ilipofikia.",
            ],
          },
        },
        {
          kind: "screen",
          title: ["Sourcing & China markets", "Kutafuta bidhaa na masoko ya China"],
          eyebrow: ["Finding goods in China", "Kutafuta bidhaa China"],
          route: "/app/support/sourcing · /app/support/markets",
          intro: [
            "Move sourcing requests left to right: New → In progress → Waiting for customer → Supplier found → Completed. Use the markets directory to point customers at the right Guangzhou market.",
            "Sogeza maombi ya kutafuta bidhaa kutoka kushoto kwenda kulia: Mpya → Inaendelea → Inasubiri mteja → Msambazaji amepatikana → Imekamilika. Tumia orodha ya masoko kuwaelekeza wateja soko sahihi la Guangzhou.",
          ],
          figure: { shot: "sourcing-hero", crop: true },
          callout: {
            kind: "warn",
            label: ["Careful", "Kuwa makini"],
            text: [
              "You cannot mark a request *Supplier found* or *Completed* without recording what you found. Goods from around Guangzhou consolidate at the Guangzhou warehouse; electronics from Shenzhen fly out of Hong Kong — telling a customer the wrong one changes what they pay.",
              "Huwezi kuweka alama *Msambazaji amepatikana* au *Imekamilika* bila kuandika ulichokipata. Bidhaa za maeneo ya Guangzhou hukusanywa ghala la Guangzhou; vifaa vya elektroniki vya Shenzhen husafiri kupitia Hong Kong — kumwambia mteja soko lisilo sahihi kunabadilisha atakacholipa.",
            ],
          },
        },
        {
          kind: "screen",
          title: ["Pickup notes & Issues", "Hati za kuchukua na Matatizo"],
          eyebrow: ["Read and print only", "Kusoma na kuchapisha tu"],
          route: "/app/finance/pickup-notes · /app/exceptions",
          intro: [
            "You can read, print and search pickup notes. You cannot issue one and you cannot cancel one. For cases, you can move them between open, under investigation and waiting on the customer — but you cannot approve compensation.",
            "Unaweza kusoma, kuchapisha na kutafuta hati za kuchukua. Huwezi kutoa wala kufuta. Kwa kesi, unaweza kuzisogeza kati ya wazi, uchunguzi unaendelea na inasubiri mteja — lakini huwezi kuidhinisha fidia.",
          ],
          figure: { shot: "pickup-notes-hero", crop: true },
        },
      ],
    },

    {
      title: ["The complete journey", "Safari kamili"],
      blurb: ["Where your part sits in the whole chain.", "Sehemu yako iko wapi kwenye mnyororo mzima."],
      pages: [
        {
          title: ["Fifteen steps, five departments", "Hatua kumi na tano, vitengo vitano"],
          eyebrow: ["End to end", "Mwanzo hadi mwisho"],
          blocks: [
            {
              type: "flow",
              steps: [
                { who: ["Guangzhou", "Ghala la Guangzhou"], what: ["Cargo registered and flown", "Mzigo unasajiliwa na kusafirishwa"], tone: "draft" },
                { who: ["Dar floor", "Ghala la Dar"], what: ["Checked in against the manifest", "Unakaguliwa kwa orodha ya mizigo"], tone: "draft" },
                { who: ["System", "Mfumo"], what: ["Priced automatically as a DRAFT", "Unapangiwa bei kiotomatiki kama RASIMU"], tone: "draft",
                  note: ["Do not quote this figure.", "Usinukuu kiasi hiki."] },
                { who: ["Finance", "Fedha"], what: ["Confirm the price → a real bill", "Wanathibitisha bei → ankara halisi"], tone: "owed" },
                { who: ["You", "Wewe"], what: ["The row appears on your call list", "Mstari unatokea kwenye orodha yako ya simu"], tone: "info" },
                { who: ["You", "Wewe"], what: ["Ring or WhatsApp the customer", "Piga simu au WhatsApp kwa mteja"], tone: "info",
                  note: ["Quote the row, never the band total.", "Nukuu mstari, siyo jumla ya juu."] },
                { who: ["Customer", "Mteja"], what: ["Pays and sends proof", "Analipa na kutuma ushahidi"], tone: "info" },
                { who: ["You", "Wewe"], what: ["Record the claim with the evidence", "Andika dai pamoja na ushahidi"], tone: "info",
                  note: ["A claim is not money.", "Dai siyo pesa."] },
                { who: ["Finance", "Fedha"], what: ["Verify · receipt · pickup note", "Wanathibitisha · risiti · hati ya kuchukua"], tone: "paid" },
                { who: ["You", "Wewe"], what: ["Tell the customer to collect", "Mwambie mteja aje kuchukua"], tone: "paid",
                  note: ["Only now — the note exists.", "Sasa tu — hati ipo."] },
                { who: ["Dar floor", "Ghala la Dar"], what: ["Scan · photograph · hand over", "Skani · piga picha · kabidhi"], tone: "paid" },
              ],
            },
          ],
        },
      ],
    },

    {
      title: ["A worked example", "Mfano wa vitendo"],
      blurb: ["One customer, from the call to the collection.", "Mteja mmoja, kutoka simu hadi kuchukua."],
      pages: [
        {
          title: ["TX-000042 · shoes for John Peter", "TX-000042 · viatu vya John Peter"],
          eyebrow: ["Follow it through", "Fuatilia hadi mwisho"],
          blocks: [
            {
              type: "example",
              fields: [
                { k: ["Customer", "Mteja"], v: "John Peter" },
                { k: ["Tracking", "Ufuatiliaji"], v: "TX-000042" },
                { k: ["Invoice", "Ankara"], v: "USD 48.60" },
                { k: ["Phone", "Simu"], v: "0764 197 748" },
              ],
            },
            {
              type: "table",
              head: [["Stage", "Hatua"], ["What you do", "Unachofanya"]],
              rows: [
                [["Row appears", "Mstari unatokea"], ["Finance confirms the price. TX-000042 lands on your call list with 'Ring them' in the Next action column.", "Fedha wanathibitisha bei. TX-000042 unatokea kwenye orodha yako ya simu na 'Mpigie simu' kwenye safu ya Hatua Inayofuata."]],
                [["You ring", "Unapiga simu"], ["You press the WhatsApp icon. The Swahili reminder is pre-written with his name, TX-000042, shoes, the invoice number and the amount in shillings.", "Unabonyeza alama ya WhatsApp. Ujumbe wa Kiswahili umeshaandikwa na jina lake, TX-000042, viatu, namba ya ankara na kiasi kwa shilingi."]],
                [["He pays", "Analipa"], ["John sends the money by M-Pesa and forwards you the confirmation screenshot.", "John anatuma pesa kwa M-Pesa na kukutumia picha ya uthibitisho."]],
                [["You record it", "Unaiandika"], ["You open the payment icon on his row, type the M-Pesa reference, attach his screenshot, and hand it up. Nothing has settled yet.", "Unafungua alama ya malipo kwenye mstari wake, unaandika namba ya M-Pesa, unaambatisha picha yake, na kuwasilisha. Bado hakuna kilichokamilika."]],
                [["Finance verifies", "Fedha wanathibitisha"], ["They match the proof to the M-Pesa account and verify. A receipt is numbered and the pickup note is issued.", "Wanalinganisha ushahidi na akaunti ya M-Pesa na kuthibitisha. Risiti inapewa namba na hati ya kuchukua inatolewa."]],
                [["You tell him", "Unamwambia"], ["Now — and only now — you ring John and tell him the cargo is ready to collect.", "Sasa — na sasa tu — unampigia John na kumwambia mzigo uko tayari kuchukuliwa."]],
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
          eyebrow: ["Fix it this way", "Rekebisha hivi"],
          blocks: [
            {
              type: "table",
              head: [["The mistake", "Kosa"], ["What it causes", "Linalosababisha"], ["What to do", "Cha kufanya"]],
              rows: [
                [["Quoting the band total", "Kunukuu jumla ya juu"], ["You quote a live estimate; the customer pays a different figure and disputes it.", "Unanukuu makadirio; mteja analipa kiasi tofauti na kupinga."], ["Quote the amount on the customer's own row.", "Nukuu kiasi kilicho kwenye mstari wa mteja mwenyewe."]],
                [["Quoting a draft", "Kunukuu rasimu"], ["You ask for a figure the business has not agreed. It may change.", "Unaomba kiasi ambacho kampuni haijakubali. Kinaweza kubadilika."], ["Wait for Finance to confirm the price.", "Subiri Fedha wathibitishe bei."]],
                [["A reference with no attachment", "Namba bila kiambatisho"], ["Finance cannot verify it and sends it back; the customer waits another day.", "Fedha hawawezi kuthibitisha na wanarudisha; mteja anasubiri siku nyingine."], ["Always attach the screenshot or slip.", "Daima ambatisha picha au risiti."]],
                [["A second claim after a rejection", "Dai la pili baada ya kukataliwa"], ["Two claims on one bill; the system refuses and the record looks like a cover-up.", "Madai mawili kwa ankara moja; mfumo unakataa na kumbukumbu inaonekana kama kuficha."], ["Correct the claim against the same invoice.", "Rekebisha dai kwa ankara ileile."]],
                [["Telling a customer to collect too early", "Kumwambia mteja aje mapema mno"], ["They travel to the warehouse and are turned away.", "Anasafiri hadi ghalani na kurudishwa."], ["Wait until the cargo shows Ready for pickup.", "Subiri hadi mzigo uonyeshe Tayari kuchukuliwa."]],
                [["Closing a ticket with no resolution", "Kufunga tiketi bila suluhisho"], ["The system refuses — and the next person has no idea what happened.", "Mfumo unakataa — na mtu ajaye hajui kilichotokea."], ["Write what you actually did.", "Andika ulichofanya hasa."]],
                [["Chasing cargo under investigation", "Kufuatilia mzigo ulio kwenye uchunguzi"], ["You demand money for a box the warehouse cannot find.", "Unadai pesa kwa boksi ambalo ghala haliwezi kulipata."], ["Check Issues & Claims before ringing.", "Kagua Matatizo na Madai kabla ya kupiga simu."]],
              ],
            },
          ],
        },
      ],
    },

    {
      title: ["Working well", "Kufanya kazi vizuri"],
      blurb: ["Habits that keep customers calm and the record clean.", "Tabia zinazotuliza wateja na kuweka kumbukumbu safi."],
      pages: [
        {
          title: ["Best practice", "Mbinu bora"],
          eyebrow: ["Do it this way", "Fanya hivi"],
          blocks: [
            {
              type: "cards",
              columns: 2,
              items: [
                { label: ["Order", "Mpangilio"], title: ["Work the panel in its order", "Fanya kazi kwa mpangilio wa paneli"], body: ["It is already sorted by what costs the business most. Do not pick by eye.", "Imeshapangwa kwa hasara kubwa kwa kampuni. Usichague kwa macho."] },
                { label: ["Rejections", "Yaliyorudishwa"], title: ["Clear them first", "Zishughulikie kwanza"], body: ["A rejection means a customer believes they paid and the business disagrees. Nothing is more urgent.", "Kukataliwa maana yake mteja anaamini amelipa na kampuni haikubali. Hakuna cha dharura zaidi."] },
                { label: ["Quotes", "Nukuu"], title: ["Read the rate book", "Soma kitabu cha bei"], body: ["Never quote from memory. If you think a rate is wrong, tell Finance — do not tell the customer a different number.", "Usinukuu kwa kumbukumbu. Ukidhani bei si sahihi, waambie Fedha — usimwambie mteja kiasi tofauti."] },
                { label: ["Evidence", "Ushahidi"], title: ["Proof, not promises", "Ushahidi, siyo ahadi"], body: ["A reference on its own comes straight back. Attach the file the first time.", "Namba peke yake inarudi mara moja. Ambatisha faili mara ya kwanza."] },
                { label: ["Notes", "Maelezo"], title: ["Write internal notes freely", "Andika maelezo ya ndani bila wasiwasi"], body: ["They are never shown to the customer, and they save the next person the whole conversation.", "Hayaonyeshwi kwa mteja, na yanamwokoa ajaye mazungumzo yote."] },
                { label: ["Promises", "Ahadi"], title: ["Never promise a release", "Usiahidi kutolewa kwa mzigo"], body: ["You cannot issue the note. Say 'once Finance confirms' — and mean it.", "Huwezi kutoa hati. Sema 'baada ya Fedha kuthibitisha' — na uwe na maana."] },
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
          eyebrow: ["FAQ", "Maswali"],
          blocks: [
            {
              type: "table",
              head: [["Question", "Swali"], ["Answer", "Jibu"]],
              rows: [
                [["The customer paid but the system still says unpaid.", "Mteja amelipa lakini mfumo bado unasema hajalipa."], ["Your claim is with Finance. Nothing settles until they verify it — that is the design, not a delay you caused.", "Dai lako liko kwa Fedha. Hakuna kinachokamilika hadi wathibitishe — hiyo ndiyo muundo, siyo ucheleweshaji wako."]],
                [["Can I give a discount?", "Naweza kutoa punguzo?"], ["No. You can edit an invoice's notes and other charges, but not the discount. That is deliberate.", "Hapana. Unaweza kuhariri maelezo na gharama nyingine za ankara, lakini siyo punguzo. Hiyo ni kwa makusudi."]],
                [["A customer is angry about storage charges.", "Mteja amekasirika kuhusu gharama za uhifadhi."], ["Storage is free for 7 days, then USD 2 per day. Explain the policy, and send billing questions to Finance.", "Uhifadhi ni bure kwa siku 7, kisha USD 2 kwa siku. Eleza sera, na peleka maswali ya ankara kwa Fedha."]],
                [["Someone is asking for a price before they are a customer.", "Mtu anauliza bei kabla hajawa mteja."], ["That is normal. Open a ticket with just a name or phone number and read the quote off Price Configuration.", "Ni kawaida. Fungua tiketi kwa jina au namba ya simu tu na usome nukuu kutoka Mipangilio ya Bei."]],
                [["Can I see how much the company has in the bank?", "Naweza kuona kampuni ina kiasi gani benki?"], ["No. You chase a customer's bill; you do not keep the books. Those are two different permissions on purpose.", "Hapana. Wewe unafuatilia ankara ya mteja; huwezi kutunza vitabu. Hayo ni mamlaka mawili tofauti kwa makusudi."]],
              ],
            },
          ],
        },
      ],
    },

    {
      title: ["Summary", "Muhtasari"],
      blurb: ["Three things carry this desk.", "Mambo matatu yanayobeba kitengo hiki."],
      pages: [
        {
          title: ["The customer desk in one page", "Kitengo cha wateja kwa ukurasa mmoja"],
          eyebrow: ["Keep this one", "Hifadhi hii"],
          blocks: [
            {
              type: "cards",
              columns: 3,
              items: [
                { label: ["1", "1"], title: ["Work the panel in order", "Fanya kazi kwa mpangilio"], body: ["It is already sorted by what costs the business most.", "Imeshapangwa kwa hasara kubwa kwa kampuni."] },
                { label: ["2", "2"], title: ["Never quote what is not agreed", "Usinukuu kisichokubaliwa"], body: ["Not a draft, not a band total. Quote the customer's own row.", "Siyo rasimu, siyo jumla ya juu. Nukuu mstari wa mteja mwenyewe."] },
                { label: ["3", "3"], title: ["Take the proof, not the promise", "Chukua ushahidi, siyo ahadi"], body: ["A reference on its own comes straight back.", "Namba peke yake inarudi mara moja."] },
              ],
            },
            {
              type: "callout",
              kind: "tip",
              label: ["If you remember one sentence", "Ukikumbuka sentensi moja"],
              text: [
                "You hold the relationship; Finance holds the money. Keeping those apart is what lets you be completely straight with a customer about everything except whether their payment has landed.",
                "Wewe unashikilia uhusiano; Fedha wanashikilia pesa. Kutenganisha hivyo ndiko kunakokuwezesha kuwa mnyoofu kabisa kwa mteja kuhusu kila kitu isipokuwa kama malipo yake yamefika.",
              ],
            },
          ],
        },
      ],
    },
  ],
};
