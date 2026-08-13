/**
 * Dar es Salaam Warehouse — staff training manual.
 * English + Kiswahili, every line.
 */

export default {
  department: ["Dar es Salaam Warehouse", "Ghala la Dar es Salaam"],
  version: "1.0",
  languages: "English · Kiswahili",
  audience: "Dar floor and counter staff",
  issued: "August 2026",
  contentsAlt: "Yaliyomo",

  sections: [
    {
      title: ["Welcome to the Dar floor", "Karibu kwenye ghala la Dar"],
      blurb: [
        "From the moment a flight lands until a customer walks out with their boxes, the cargo is yours.",
        "Tangu ndege inapotua hadi mteja anapotoka na mizigo yake, mizigo hiyo iko chini yako.",
      ],
      pages: [
        {
          title: ["What this desk is for", "Kazi ya kitengo hiki"],
          eyebrow: "Mission",
          blocks: [
            {
              type: "text",
              text: [
                "You take physical custody of everything this business flies. You count what arrives, you say what condition it is in, you hold it safely, and you hand it over — but only against a pickup note Finance has issued. You never write the China record and you never touch money.",
                "Wewe ndiye unayepokea na kutunza kila mzigo unaosafirishwa na kampuni hii. Unahesabu kilichofika, unathibitisha hali yake, unautunza salama, na unaukabidhi — lakini tu kwa kutumia hati ya kuchukua mzigo iliyotolewa na Fedha. Hauandiki kumbukumbu za China wala hushughuliki na pesa.",
              ],
            },
            {
              type: "cards",
              columns: 2,
              items: [
                {
                  label: "Your word counts",
                  title: ["What arrived, and in what condition", "Kilichofika, na hali yake"],
                  body: [
                    "Your check-in is the only comparison anyone will ever make between what Guangzhou declared and what actually landed. Nobody audits it afterwards. If you tick a box clean, it is clean.",
                    "Ukaguzi wako ndio ulinganisho pekee kati ya kile Guangzhou walichotangaza na kile kilichofika kweli. Hakuna anayekagua tena baadaye. Ukiweka alama kuwa mzigo ni salama, basi ni salama.",
                  ],
                },
                {
                  label: "Not your call",
                  title: ["Whether the cargo may leave", "Kama mzigo unaweza kutoka"],
                  body: [
                    "That is answered by a pickup note Finance issued, and by any open case on the cargo. You cannot see a price or issue a note. If there is no note, the answer is 'check with Finance' — never a workaround.",
                    "Hilo linajibiwa na hati ya kuchukua iliyotolewa na Fedha, na kesi yoyote iliyo wazi kuhusu mzigo. Huwezi kuona bei wala kutoa hati. Kama hakuna hati, jibu ni 'wasiliana na Fedha' — kamwe usitafute njia ya mkato.",
                  ],
                },
              ],
            },
            {
              type: "table",
              head: ["Your day", "What it means"],
              rows: [
                [
                  ["Read the floor", "Angalia hali ya ghala"],
                  ["Three chips and one panel tell you the whole morning.", "Vipimo vitatu na paneli moja vinakuonyesha kazi ya asubuhi nzima."],
                ],
                [
                  ["Land the flight", "Pokea ndege"],
                  ["Mark the batch arrived. From here it is yours to check in.", "Weka alama kuwa kundi limefika. Kuanzia hapa ni jukumu lako kulikagua."],
                ],
                [
                  ["Check in every line", "Kagua kila mstari"],
                  ["Six outcomes. Damage needs a severity and a photograph.", "Matokeo sita. Uharibifu unahitaji kiwango na picha."],
                ],
                [
                  ["Release cargo", "Kabidhi mzigo"],
                  ["Scan the carton, photograph the handover, hand it over.", "Skani boksi, piga picha ya makabidhiano, kabidhi."],
                ],
              ],
            },
          ],
        },
        {
          title: ["What you may and may not do", "Unachoweza na usichoweza"],
          eyebrow: "Authority",
          blocks: [
            {
              type: "cards",
              columns: 2,
              items: [
                {
                  label: "You may",
                  title: ["Count, hold, hand over", "Hesabu, tunza, kabidhi"],
                  body: [
                    "Mark a flight arrived · check it in against the manifest · rule on every consignment · see the photographs Guangzhou took · scan and release against an active pickup note · open an investigation when a box is missing.",
                    "Weka alama ndege imefika · kagua kwa kutumia orodha ya mizigo · toa uamuzi kwa kila mzigo · ona picha zilizopigwa Guangzhou · skani na kabidhi kwa hati hai ya kuchukua · fungua uchunguzi mzigo unapokosekana.",
                  ],
                },
                {
                  label: "You may not",
                  title: ["Register, price, release without a note", "Kusajili, kupanga bei, kukabidhi bila hati"],
                  body: [
                    "Register cargo · print or reprint a label · see any price or invoice · open, print, issue or cancel a pickup note · seal or dispatch a batch · approve a payout on a claim.",
                    "Kusajili mzigo · kuchapisha au kuchapisha upya lebo · kuona bei au ankara yoyote · kufungua, kuchapisha, kutoa au kufuta hati ya kuchukua · kufunga au kusafirisha kundi · kuidhinisha malipo ya fidia.",
                  ],
                },
              ],
            },
            {
              type: "callout",
              kind: "stop",
              label: "The rule that protects you",
              text: [
                "*A partial shipment is never released.* Handing over four boxes out of five and sorting it out later is how a claim starts. The system refuses it, and that refusal is on your side.",
                "*Mzigo usiokamilika haukabidhiwi kamwe.* Kukabidhi maboksi manne kati ya matano na kumalizia baadaye ndiyo chanzo cha madai. Mfumo unakataa, na kukataa huko kunakulinda wewe.",
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
            "Open the address on the counter computer or your phone. Type your work email and password, then press Sign in. You land straight on your own department's home — there is no department to choose.",
            "Fungua anwani hii kwenye kompyuta ya kaunta au simu yako. Andika barua pepe yako ya kazi na nenosiri, kisha bonyeza Ingia. Utafika moja kwa moja kwenye ukurasa wa kitengo chako — huhitaji kuchagua kitengo.",
          ],
          figure: {
            shot: "login",
            crop: true,
            pins: [
              { n: 1, x: 50, y: 44 },
              { n: 2, x: 50, y: 57 },
              { n: 3, x: 50, y: 70 },
            ],
          },
          keys: [
            { n: 1, title: ["Email", "Barua pepe"], body: ["Your work email, e.g. warehouse@targetexpress.co.tz.", "Barua pepe yako ya kazi, mfano warehouse@targetexpress.co.tz."] },
            { n: 2, title: ["Password", "Nenosiri"], body: ["Set by management. Change it from Profile once you are in.", "Imewekwa na uongozi. Ibadilishe kwenye Wasifu baada ya kuingia."] },
            { n: 3, title: ["Sign in", "Ingia"], body: ["Takes you to the Dar floor home screen.", "Inakupeleka kwenye ukurasa wa ghala la Dar."] },
          ],
          callout: {
            kind: "tip",
            text: [
              "Never share an account. Every check-in and every handover carries the name of whoever was signed in.",
              "Usishirikishe akaunti yako. Kila ukaguzi na kila makabidhiano hubeba jina la aliyeingia.",
            ],
          },
        },
      ],
    },

    {
      title: ["Your home screen", "Ukurasa wako wa mwanzo"],
      blurb: ["Three numbers and one job list.", "Namba tatu na orodha moja ya kazi."],
      pages: [
        {
          kind: "screen",
          title: ["Home, section by section", "Ukurasa wa mwanzo, sehemu kwa sehemu"],
          eyebrow: "Dashboard",
          route: "/app/dashboard",
          intro: [
            "You see cargo and time. You do not see money, anywhere, by design.",
            "Unaona mizigo na muda. Huoni pesa popote, na hivyo ndivyo mfumo ulivyoundwa.",
          ],
          figure: {
            shot: "home-hero",
            crop: true,
            pins: [
              { n: 1, x: 55, y: 15 },
              { n: 2, x: 55, y: 27 },
              { n: 3, x: 60, y: 55 },
              { n: 4, x: 10, y: 32 },
            ],
          },
          keys: [
            {
              n: 1,
              title: ["The banner", "Kichwa cha ukurasa"],
              body: ["Your name and the department badge.", "Jina lako na alama ya kitengo."],
            },
            {
              n: 2,
              title: ["Three floor chips", "Vipimo vitatu vya ghala"],
              body: [
                "Cargo in the warehouse, boxes on the floor, weight on the floor. The boxes chip reads 'short of the manifest' when fewer cartons were ticked in than Guangzhou declared.",
                "Mizigo iliyoko ghalani, maboksi yaliyopo, na uzito uliopo. Kipimo cha maboksi husema 'pungufu ya orodha' pale maboksi yaliyopokelewa ni machache kuliko Guangzhou walivyotangaza.",
              ],
            },
            {
              n: 3,
              title: ["Needs your attention", "Yanayohitaji uangalizi wako"],
              body: [
                "Flights to land, counts that do not match, cargo ready to be collected today. Work it from the top.",
                "Ndege za kupokea, hesabu zisizolingana, mizigo iliyo tayari kuchukuliwa leo. Anza kutoka juu.",
              ],
            },
            {
              n: 4,
              title: ["The sidebar", "Menyu ya kando"],
              body: ["Everything you can reach, grouped by the kind of work.", "Kila ukurasa unaoweza kufikia, umepangwa kwa aina ya kazi."],
            },
          ],
          callout: {
            kind: "warn",
            text: [
              "*'Short of the manifest' never fixes itself.* It is either a mis-scan or a genuinely missing box, and both need somebody to go and look. Recount the same day.",
              "*'Pungufu ya orodha' hakujirekebishi.* Ni ama kosa la kuskani au boksi limepotea kweli, na vyote vinahitaji mtu aende kuangalia. Hesabu tena siku hiyo hiyo.",
            ],
          },
        },
      ],
    },

    {
      title: ["The sidebar, menu by menu", "Menyu ya kando, moja baada ya nyingine"],
      blurb: ["Nine doors, and when to be in each.", "Milango tisa, na wakati wa kutumia kila mmoja."],
      pages: [
        {
          title: ["Every menu explained", "Kila menyu imeelezwa"],
          eyebrow: "Navigation",
          blocks: [
            {
              type: "table",
              head: ["Menu", "What it is, and when to use it"],
              rows: [
                [["Home", "/app/dashboard"], ["Your starting point and the attention panel.", "Mwanzo wa kazi na paneli ya matukio yanayohitaji uangalizi."]],
                [["Search", "/app/search"], ["Find any consignment by tracking number, customer, phone or carton reference.", "Tafuta mzigo wowote kwa namba ya ufuatiliaji, mteja, simu au namba ya boksi."]],
                [["Scan & release", "/app/release"], ["One scan takes you to everything you need to hand cargo over.", "Skani moja inakupa kila kitu unachohitaji kukabidhi mzigo."]],
                [["Pickup Queue", "/app/pickup-queue"], ["Who may collect today, and what is blocking the rest.", "Nani anaweza kuchukua leo, na nini kinazuia wengine."]],
                [["Receiving Dock", "/app/receive"], ["Flights to land, and the bench where you check them in.", "Ndege za kupokea, na sehemu ya kukagua mizigo."]],
                [["Available Cargo", "/app/inventory"], ["What is on the floor now, and how long each piece has stood.", "Kilichopo ghalani sasa, na muda kila mzigo umekaa."]],
                [["Collected Cargo", "/app/deliveries"], ["Every handover, with the receiver, the relationship and the photo.", "Kila makabidhiano, na aliyepokea, uhusiano wake na picha."]],
                [["Issues & Claims", "/app/exceptions"], ["Cases on your floor. Move them along; the CEO approves payouts.", "Kesi za ghala lako. Zisogeze mbele; Mkurugenzi ndiye anaidhinisha malipo."]],
                [["Reports", "/app/reports"], ["Throughput, how long each leg took, and who did the work.", "Kiasi cha kazi, muda wa kila hatua, na nani alifanya kazi."]],
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
          title: ["Receiving Dock — checking a flight in", "Sehemu ya kupokea — kukagua ndege"],
          eyebrow: "The bench",
          route: "/app/receive",
          intro: [
            "Find the batch that has landed and mark it arrived. Then print the manifest and check the boxes against paper — not against a screen you are also trying to hold while counting.",
            "Tafuta kundi lililofika na uweke alama limefika. Kisha chapisha orodha ya mizigo na ukague maboksi ukitumia karatasi — siyo skrini unayoshikilia huku unahesabu.",
          ],
          figure: { shot: "receiving-dock-hero", crop: true },
          keys: [
            {
              n: 1,
              title: ["Mark as arrived", "Weka alama imefika"],
              body: [
                "Only a batch in transit can be landed. From this moment the batch is yours to check in.",
                "Ni kundi lililo safarini pekee linaloweza kuwekewa alama limefika. Kuanzia hapa kundi ni jukumu lako.",
              ],
            },
            {
              n: 2,
              title: ["The six outcomes", "Matokeo sita"],
              body: [
                "Received, Missing, Damaged, Wrong item, Wrong quantity, Hold for investigation. Anything other than Received opens a case automatically.",
                "Imepokelewa, Haipo, Imeharibika, Bidhaa isiyo sahihi, Idadi isiyo sahihi, Zuia kwa uchunguzi. Chochote kisicho 'Imepokelewa' hufungua kesi moja kwa moja.",
              ],
            },
            {
              n: 3,
              title: ["The China photographs", "Picha za China"],
              body: [
                "Each row opens to show what Guangzhou photographed before the cargo flew. If there are none, check the label and packing list harder before you tick it clean.",
                "Kila mstari unafunguka kuonyesha picha Guangzhou walizopiga kabla mzigo haujasafiri. Kama hakuna, kagua lebo na orodha ya vifurushi kwa makini zaidi kabla ya kuweka alama ya usalama.",
              ],
            },
          ],
          callout: {
            kind: "stop",
            text: [
              "*Damage needs a severity and a photograph.* This is the only moment that picture can be taken. Once the box is on the shelf, nobody can prove whether it arrived that way or was dropped here.",
              "*Uharibifu unahitaji kiwango na picha.* Huu ndio wakati pekee picha hiyo inaweza kupigwa. Boksi likishawekwa rafuni, hakuna anayeweza kuthibitisha kama lilifika hivyo au liliangushwa hapa.",
            ],
          },
        },
        {
          kind: "screen",
          title: ["Scan & release — the handover", "Skani na kabidhi — makabidhiano"],
          eyebrow: "The counter",
          route: "/app/release",
          intro: [
            "One scan of the QR on the carton. The screen opens with the customer, the cargo, whether it is paid, and the release form — everything on one page, nothing to go and fetch.",
            "Skani moja ya msimbo wa QR ulioko kwenye boksi. Ukurasa unafunguka na taarifa za mteja, mzigo, kama umelipiwa, na fomu ya kukabidhi — kila kitu ukurasa mmoja, hakuna cha kwenda kutafuta.",
          ],
          figure: { shot: "scan-release-hero", crop: true },
          keys: [
            {
              n: 1,
              title: ["Six things must agree", "Mambo sita lazima yakubaliane"],
              body: [
                "An active pickup note, the note matching this cargo, no open case, every package checked in, the full carton count, and the handover photograph. All re-checked together at the moment you press the button.",
                "Hati hai ya kuchukua, hati inayolingana na mzigo huu, hakuna kesi iliyo wazi, kila kifurushi kimepokelewa, idadi kamili ya maboksi, na picha ya makabidhiano. Vyote hukaguliwa tena kwa pamoja unapobonyeza kitufe.",
              ],
            },
            {
              n: 2,
              title: ["Who is collecting", "Nani anachukua"],
              body: [
                "Receiver name, phone, what they are to the customer, and their ID number. This is the record that settles a dispute later.",
                "Jina la mpokeaji, simu, uhusiano wake na mteja, na namba ya kitambulisho. Hii ndiyo kumbukumbu itakayotatua mgogoro baadaye.",
              ],
            },
            {
              n: 3,
              title: ["Unable to locate cargo", "Mzigo haujapatikana"],
              body: [
                "When the box is not on the shelf. Write where you looked — at least five characters, and the server refuses short answers.",
                "Pale boksi halipo rafuni. Andika ulipotafuta — angalau herufi tano, na mfumo unakataa majibu mafupi.",
              ],
            },
          ],
          callout: {
            kind: "stop",
            text: [
              "*Never mark cargo delivered when you cannot find it.* 'Where did you look?' is the only thing the person searching tomorrow has to go on. Name the shelf, the bay and the batch.",
              "*Usiweke alama kuwa mzigo umekabidhiwa ikiwa hujaupata.* 'Ulitafuta wapi?' ndicho kitu pekee atakachotumia atakayetafuta kesho. Taja rafu, eneo na kundi.",
            ],
          },
        },
        {
          kind: "screen",
          title: ["Pickup Queue — who may collect", "Foleni ya kuchukua — nani anaweza kuchukua"],
          eyebrow: "Before the counter opens",
          route: "/app/pickup-queue",
          intro: [
            "Read the blockers on each row before a customer is standing in front of you. They mirror, in the same order, the checks the release itself will run.",
            "Soma vizuizi vya kila mstari kabla mteja hajasimama mbele yako. Vinafuata mpangilio uleule wa ukaguzi utakaofanyika wakati wa kukabidhi.",
          ],
          figure: { shot: "pickup-queue-hero", crop: true },
          callout: {
            kind: "warn",
            text: [
              "A row can look perfectly paid and still be locked. *An open case holds the cargo whatever the money says.*",
              "Mstari unaweza kuonekana umelipiwa kikamilifu lakini bado umezuiwa. *Kesi iliyo wazi huzuia mzigo bila kujali hali ya malipo.*",
            ],
          },
        },
        {
          kind: "screen",
          title: ["Available Cargo — what is standing", "Mizigo iliyopo — iliyoko ghalani"],
          eyebrow: "The floor",
          route: "/app/inventory",
          intro: [
            "What is on the floor now, sorted by how long it has stood. Storage is free for 7 days, then USD 2 per day. You cannot see or quote the charge — tell the customer to collect and let Finance state the amount.",
            "Kilichoko ghalani sasa, kimepangwa kwa muda kilichokaa. Uhifadhi ni bure kwa siku 7, kisha USD 2 kwa siku. Huwezi kuona wala kutaja gharama — mwambie mteja aje kuchukua, na Fedha ndio watataja kiasi.",
          ],
          figure: { shot: "available-cargo-hero", crop: true },
        },
        {
          kind: "screen",
          title: ["Collected Cargo & Reports", "Mizigo iliyochukuliwa na Ripoti"],
          eyebrow: "The record",
          route: "/app/deliveries · /app/reports",
          intro: [
            "Every handover with the receiver, the relationship, who released it and the photo. Reports show throughput, how long each leg took, and who did the work.",
            "Kila makabidhiano likiwa na mpokeaji, uhusiano, aliyekabidhi na picha. Ripoti zinaonyesha kiasi cha kazi, muda wa kila hatua, na nani alifanya kazi.",
          ],
          figure: { shot: "collected-cargo-hero", crop: true },
          callout: {
            kind: "tip",
            text: [
              "The 'who did the work' table counts exceptions raised per person, and the page says so plainly: raising an exception is doing the job properly, not a mark against anyone. Do not stop flagging problems.",
              "Jedwali la 'nani alifanya kazi' huhesabu kesi zilizofunguliwa na kila mtu, na ukurasa unasema wazi: kufungua kesi ni kufanya kazi vizuri, siyo kosa. Usiache kuripoti matatizo.",
            ],
          },
        },
      ],
    },

    {
      title: ["The complete journey", "Safari kamili"],
      blurb: ["One box, Guangzhou to a customer's hands.", "Boksi moja, kutoka Guangzhou hadi mikononi mwa mteja."],
      pages: [
        {
          title: ["Fifteen steps, five departments", "Hatua kumi na tano, vitengo vitano"],
          eyebrow: "End to end",
          blocks: [
            {
              type: "flow",
              steps: [
                { who: "Customer", what: ["Books on the website", "Anaagiza kupitia tovuti"], tone: "draft" },
                { who: "Guangzhou", what: ["Cargo arrives, is registered", "Mzigo unafika, unasajiliwa"], tone: "draft" },
                { who: "Guangzhou", what: ["Weighed, photographed, labelled", "Unapimwa, unapigwa picha, unawekewa lebo"], tone: "draft" },
                { who: "Guangzhou", what: ["Sealed and dispatched", "Kundi linafungwa na kusafirishwa"], tone: "draft" },
                { who: "In the air", what: ["China → Tanzania", "China → Tanzania"], tone: "owed" },
                { who: "You", what: ["Mark the flight arrived", "Weka alama ndege imefika"], tone: "info",
                  note: ["The batch becomes yours to check in.", "Kundi linakuwa jukumu lako kulikagua."] },
                { who: "You", what: ["Print the manifest", "Chapisha orodha ya mizigo"], tone: "info" },
                { who: "You", what: ["Rule on every consignment", "Toa uamuzi kwa kila mzigo"], tone: "info",
                  note: ["Received, or one of five problems.", "Imepokelewa, au mojawapo ya matatizo matano."] },
                { who: "You", what: ["Finish the check-in", "Maliza ukaguzi"], tone: "info",
                  note: ["Cargo cannot be invoiced until this is done.", "Mzigo hauwezi kutozwa ankara hadi hii ikamilike."] },
                { who: "System", what: ["Cargo priced automatically", "Mzigo unapangiwa bei kiotomatiki"], tone: "owed" },
                { who: "Finance", what: ["Confirm the price → invoice", "Thibitisha bei → ankara"], tone: "owed" },
                { who: "Customer Care", what: ["Chase the customer", "Fuatilia mteja"], tone: "owed" },
                { who: "Finance", what: ["Verify payment · issue pickup note", "Thibitisha malipo · toa hati ya kuchukua"], tone: "paid" },
                { who: "You", what: ["Scan · photograph · hand over", "Skani · piga picha · kabidhi"], tone: "paid" },
                { who: "Customer", what: ["Walks out with the cargo", "Anaondoka na mzigo wake"], tone: "paid" },
              ],
            },
          ],
        },
      ],
    },

    {
      title: ["A worked example", "Mfano wa vitendo"],
      blurb: ["One consignment, followed through your part.", "Mzigo mmoja, ukifuatiliwa katika sehemu yako."],
      pages: [
        {
          title: ["TX-000042 · shoes for John Peter", "TX-000042 · viatu vya John Peter"],
          eyebrow: "Follow it through",
          blocks: [
            {
              type: "example",
              fields: [
                { k: "Customer", v: "John Peter" },
                { k: "Tracking", v: "TX-000042" },
                { k: "Weight", v: "3.6 kg" },
                { k: "Cargo", v: "Shoes · Viatu" },
              ],
            },
            {
              type: "table",
              head: ["Stage", "What you do"],
              rows: [
                [
                  ["Flight lands", "Ndege inatua"],
                  [
                    "You open Receiving Dock, find batch GZ/26-28 and press 'Mark as arrived'.",
                    "Unafungua Sehemu ya kupokea, unatafuta kundi GZ/26-28 na kubonyeza 'Weka alama imefika'.",
                  ],
                ],
                [
                  ["Manifest", "Orodha ya mizigo"],
                  [
                    "You print it and work down the sheet. TX-000042 is two cartons, 3.6 kg, shoes.",
                    "Unaichapisha na kufuata orodha. TX-000042 ni maboksi mawili, kilo 3.6, viatu.",
                  ],
                ],
                [
                  ["Check in", "Ukaguzi"],
                  [
                    "Both boxes are present and undamaged. You tick Received. Both packages are now accounted for.",
                    "Maboksi yote mawili yapo na hayajaharibika. Unaweka alama Imepokelewa. Vifurushi vyote sasa vimehesabiwa.",
                  ],
                ],
                [
                  ["Wait", "Subiri"],
                  [
                    "You do nothing further. Finance confirms the price, the customer pays, and the pickup note is issued.",
                    "Hufanyi kitu kingine. Fedha wanathibitisha bei, mteja analipa, na hati ya kuchukua inatolewa.",
                  ],
                ],
                [
                  ["Handover", "Makabidhiano"],
                  [
                    "John arrives. You scan one carton. The screen shows both boxes accounted for and the note active. You record his name, phone and ID, photograph the handover, and complete it.",
                    "John anafika. Unaskani boksi moja. Skrini inaonyesha maboksi yote yamehesabiwa na hati ipo hai. Unaandika jina lake, simu na kitambulisho, unapiga picha ya makabidhiano, na kukamilisha.",
                  ],
                ],
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
                [
                  ["Ticking a flight clean without opening the rows", "Kuweka alama ndege nzima ni salama bila kufungua mistari"],
                  ["A damaged box enters the warehouse as undamaged.", "Boksi lililoharibika linaingia ghalani kama salama."],
                  ["Open each row against the printed manifest.", "Fungua kila mstari ukilinganisha na orodha iliyochapishwa."],
                ],
                [
                  ["Marking damage without the photograph", "Kuripoti uharibifu bila picha"],
                  ["The system refuses — and without it there is no proof it flew that way.", "Mfumo unakataa — na bila picha hakuna ushahidi kuwa ulifika hivyo."],
                  ["Photograph it on the bench, before it moves.", "Piga picha hapo hapo, kabla haujahamishwa."],
                ],
                [
                  ["Ignoring 'short of the manifest'", "Kupuuza 'pungufu ya orodha'"],
                  ["A missing box is discovered weeks later, when nobody can retrace it.", "Boksi lililopotea linagundulika wiki kadhaa baadaye, hakuna anayeweza kufuatilia."],
                  ["Recount the same day and open a case if it is real.", "Hesabu tena siku hiyo hiyo na fungua kesi kama ni kweli."],
                ],
                [
                  ["Handing over part of a consignment", "Kukabidhi sehemu ya mzigo"],
                  ["Refused by the system, and the customer leaves believing they got everything.", "Mfumo unakataa, na mteja anaondoka akidhani amepata kila kitu."],
                  ["Release all packages together, or none.", "Kabidhi vifurushi vyote kwa pamoja, au usikabidhi kabisa."],
                ],
                [
                  ["Marking cargo delivered when it cannot be found", "Kuweka alama umekabidhiwa wakati haujapatikana"],
                  ["The trail goes cold and the business carries the loss.", "Ufuatiliaji unakwama na kampuni inabeba hasara."],
                  ["Press 'Unable to locate' and write where you looked.", "Bonyeza 'Haujapatikana' na andika ulipotafuta."],
                ],
                [
                  ["Arguing with a customer about their bill", "Kubishana na mteja kuhusu ankara yake"],
                  ["You have no figures on screen, so you cannot be right.", "Huna takwimu skrini, hivyo huwezi kuwa sahihi."],
                  ["Send them to Finance; keep the counter moving.", "Mpeleke kwa Fedha; endelea na kazi ya kaunta."],
                ],
              ],
            },
          ],
        },
      ],
    },

    {
      title: ["Working well", "Kufanya kazi vizuri"],
      blurb: ["Habits that protect you and the customer.", "Tabia zinazokulinda wewe na mteja."],
      pages: [
        {
          title: ["Best practice", "Mbinu bora"],
          eyebrow: "Do it this way",
          blocks: [
            {
              type: "cards",
              columns: 2,
              items: [
                { label: "Count", title: ["Against paper, always", "Kwa karatasi, kila wakati"],
                  body: ["Print the manifest. Counting off a screen you are holding is how a line gets skipped.", "Chapisha orodha. Kuhesabu ukiangalia skrini unayoshikilia ndiko kunakosababisha kuruka mstari."] },
                { label: "Photograph", title: ["At the moment, not later", "Wakati huo huo, siyo baadaye"],
                  body: ["Damage on the bench, handover at the counter. Neither picture can be taken afterwards.", "Uharibifu hapo mezani, makabidhiano kaunta. Picha zote mbili haziwezi kupigwa baadaye."] },
                { label: "Queue", title: ["Pre-check before customers arrive", "Kagua kabla wateja hawajafika"],
                  body: ["Read the blockers early. That is the difference between a two-minute handover and an argument.", "Soma vizuizi mapema. Hiyo ndiyo tofauti kati ya makabidhiano ya dakika mbili na ugomvi."] },
                { label: "Missing", title: ["Write where you looked", "Andika ulipotafuta"],
                  body: ["Name the shelf, the bay, the batch. 'Not found' helps nobody.", "Taja rafu, eneo, kundi. 'Haijapatikana' haisaidii mtu."] },
                { label: "Money", title: ["Never quote a figure", "Usitaje kiasi chochote"],
                  body: ["You do not have prices on screen. Send the customer to Finance.", "Huna bei skrini. Mpeleke mteja kwa Fedha."] },
                { label: "Cases", title: ["Flag problems freely", "Ripoti matatizo bila woga"],
                  body: ["Raising an exception is doing the job properly. The reports say so.", "Kufungua kesi ni kufanya kazi vizuri. Ripoti zinasema hivyo."] },
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
                [
                  ["A customer has no pickup note. Can I release?", "Mteja hana hati ya kuchukua. Naweza kukabidhi?"],
                  ["No. The system will refuse. Send them to Finance — the note is issued the moment the bill is settled.", "Hapana. Mfumo utakataa. Wapeleke kwa Fedha — hati inatolewa mara tu ankara inapolipwa."],
                ],
                [
                  ["The QR label is torn and will not scan.", "Lebo ya QR imeraruka na haiskaniki."],
                  ["Use the by-hand list. The system records that it was released without scanning, which is honest and expected.", "Tumia orodha ya mkono. Mfumo utaandika kuwa ilikabidhiwa bila kuskani, jambo ambalo ni la kweli na linatarajiwa."],
                ],
                [
                  ["Only four of five boxes are on the shelf.", "Ni maboksi manne kati ya matano yaliyopo rafuni."],
                  ["Do not release any of them. Open an investigation and write where you looked.", "Usikabidhi hata moja. Fungua uchunguzi na andika ulipotafuta."],
                ],
                [
                  ["Why can I not see the price?", "Kwa nini sioni bei?"],
                  ["By design. You need the payment fact, not the figure. The figure is Finance's to defend.", "Ndivyo mfumo ulivyoundwa. Unahitaji kujua kama imelipwa, siyo kiasi. Kiasi ni jukumu la Fedha."],
                ],
                [
                  ["Can I reprint a cargo label?", "Naweza kuchapisha upya lebo ya mzigo?"],
                  ["No. The sticker is made once, in Guangzhou. A second sticker is two identities for one box.", "Hapana. Lebo hutengenezwa mara moja, Guangzhou. Lebo ya pili ni utambulisho mara mbili kwa boksi moja."],
                ],
                [
                  ["Someone else is collecting for the customer.", "Mtu mwingine anachukua kwa niaba ya mteja."],
                  ["That is normal. Record their name, phone, relationship and ID number, and photograph the handover.", "Hilo ni la kawaida. Andika jina lake, simu, uhusiano na namba ya kitambulisho, na piga picha ya makabidhiano."],
                ],
              ],
            },
          ],
        },
      ],
    },

    {
      title: ["Summary", "Muhtasari"],
      blurb: ["What to remember when everything else is forgotten.", "Cha kukumbuka hata mengine yote yakisahaulika."],
      pages: [
        {
          title: ["The Dar floor in one page", "Ghala la Dar kwa ukurasa mmoja"],
          eyebrow: "Keep this one",
          blocks: [
            {
              type: "cards",
              columns: 3,
              items: [
                { label: "Every day", title: ["Do", "Fanya"],
                  body: ["Count against paper · photograph damage on the bench · pre-check the queue · photograph every handover · flag problems.", "Hesabu kwa karatasi · piga picha ya uharibifu hapo mezani · kagua foleni mapema · piga picha kila makabidhiano · ripoti matatizo."] },
                { label: "Never", title: ["Don't", "Usifanye"],
                  body: ["Release without a note · hand over part of a consignment · mark missing cargo delivered · quote a price · share your account.", "Usikabidhi bila hati · usikabidhi sehemu ya mzigo · usiweke alama umekabidhiwa mzigo uliopotea · usitaje bei · usishirikishe akaunti."] },
                { label: "Remember", title: ["The rule", "Kanuni"],
                  body: ["You hold the cargo, not the money. That is why you can be straightforward with every customer at the counter.", "Wewe unashikilia mzigo, siyo pesa. Ndiyo maana unaweza kuwa mnyoofu kwa kila mteja kaunta."] },
              ],
            },
            {
              type: "callout",
              kind: "tip",
              label: "If you remember one sentence",
              text: [
                "Count it against paper, photograph it at the moment, and never hand over part of anything.",
                "Hesabu kwa karatasi, piga picha wakati huo huo, na usikabidhi kamwe sehemu ya mzigo wowote.",
              ],
            },
          ],
        },
      ],
    },
  ],
};
