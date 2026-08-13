/**
 * China Warehouse (Guangzhou) — staff training manual.
 * English + Simplified Chinese, every line.
 */

export default {
  department: ["China Warehouse", "中国仓库"],
  version: "1.0",
  languages: "English · 简体中文",
  audience: "Guangzhou floor staff",
  issued: "August 2026",
  contentsAlt: "目录",

  sections: [
    // ---------------------------------------------------------------- 01
    {
      title: ["Welcome to the Guangzhou floor", "欢迎加入广州仓"],
      blurb: [
        "Every record in this system starts on your bench. What you type is what four other departments work from.",
        "系统里的每一条记录都从你的工作台开始。你输入的内容，是其他四个部门工作的依据。",
      ],
      pages: [
        {
          title: ["What this desk is for", "这个岗位是做什么的"],
          eyebrow: "Mission",
          blocks: [
            {
              type: "text",
              text: [
                "You take cargo in from suppliers, weigh it, photograph it, register it, print the code that travels on every box, and put it on a flight. That is the whole job, and it is the most important one in the company — because *nobody downstream can correct what you get wrong*. Dar checks against your record. Finance bills from your weight. The customer tracks what you typed.",
                "你负责从供应商处收货、称重、拍照、登记，打印每个箱子上的条码，并把货装上飞机。这就是全部工作，也是公司里最关键的一环——因为*后面的人无法纠正你这里的错误*。达市按你的记录核对，财务按你的重量开单，客户看到的就是你输入的内容。",
              ],
            },
            {
              type: "cards",
              columns: 2,
              items: [
                {
                  label: "You create",
                  title: ["The record everyone works from", "全公司依据的记录"],
                  body: [
                    "Registering mints the tracking number, one QR label per box, the first line of history, and the loading table it belongs on.",
                    "登记时系统会生成运单号、每箱一个二维码标签、第一条状态记录，以及它所属的装货台。",
                  ],
                },
                {
                  label: "You never see",
                  title: ["What any of it costs", "货物的价格"],
                  body: [
                    "No price, no invoice, no balance — never sent to your screen at all. A rate box on the registration form would put pricing in the hands of whoever is holding the scale.",
                    "没有价格、没有账单、没有余额——这些根本不会发送到你的屏幕。如果登记表上有价格栏，定价权就落到了拿秤的人手里。",
                  ],
                },
              ],
            },
            {
              type: "table",
              head: ["Your day", "What it means"],
              rows: [
                [
                  ["Read the floor", "看一下现场"],
                  ["Open Home and work the attention panel from the top.", "打开首页，从上往下处理提醒面板。"],
                ],
                [
                  ["Ring back requests", "回访客户申请"],
                  ["Website bookings are not cargo until boxes are on your counter.", "网站预约在货物到柜台之前都不算货物。"],
                ],
                [
                  ["Register cargo", "登记货物"],
                  ["Weigh, photograph, type, save. The screen you use most.", "称重、拍照、录入、保存。用得最多的界面。"],
                ],
                [
                  ["Print and stick", "打印并贴标"],
                  ["One code per physical box, attached before it leaves the bench.", "每箱一个条码，离开工作台前必须贴好。"],
                ],
                [
                  ["Seal and dispatch", "封批发运"],
                  ["Waybill, airline, date. This cannot be undone.", "空运单号、航空公司、日期。此操作不可撤销。"],
                ],
              ],
            },
          ],
        },
        {
          title: ["What you may and may not do", "你的权限范围"],
          eyebrow: "Authority",
          blocks: [
            {
              type: "cards",
              columns: 2,
              items: [
                {
                  label: "You may",
                  title: ["Create and correct", "创建与更正"],
                  body: [
                    "Register cargo · print QR labels · correct your own entry while it is still in China · delete a duplicate with a written reason · open, load, seal and dispatch a loading table · edit the customer book · switch the interface language whenever you like.",
                    "登记货物 · 打印二维码标签 · 货物仍在中国时更正自己的录入 · 写明理由后删除重复件 · 开启、装载、封批并发运装货台 · 编辑客户名录 · 随时切换界面语言。",
                  ],
                },
                {
                  label: "You may not",
                  title: ["Money, scanning, releasing", "money、扫码、放货"],
                  body: [
                    "See any price · scan a box (that is Dar's) · receive an arriving flight · release cargo to a customer · raise a claim · edit or delete cargo that has already left China.",
                    "查看任何价格 · 扫码（属于达市）· 接收到港航班 · 向客户放货 · 提出索赔 · 编辑或删除已离开中国的货物。",
                  ],
                },
              ],
            },
            {
              type: "callout",
              kind: "stop",
              label: "The one that catches everyone",
              text: [
                "Once a loading table is sealed and dispatched, you can no longer edit or delete any cargo on it. The screen tells you: *“This cargo has already left China. Ask management to correct it.”* Check your numbers while the boxes are still in front of you.",
                "装货台一旦封批发运，你就无法再编辑或删除上面的任何货物。系统会提示：*“该货物已离开中国，请联系管理层处理。”* 请在货物还在面前时核对好数据。",
              ],
            },
          ],
        },
      ],
    },

    // ---------------------------------------------------------------- 02
    {
      title: ["Signing in", "登录系统"],
      blurb: [
        "One address, one account, and the language switch that makes the whole system Chinese.",
        "一个网址、一个账号，以及能把整个系统变成中文的语言切换。",
      ],
      pages: [
        {
          kind: "screen",
          title: ["The login screen", "登录界面"],
          eyebrow: "Step 1",
          route: "target-epress.vercel.app",
          intro: [
            "Open the address in any browser — phone or computer. Type the email your manager gave you and your password, then press Sign in. If the password is refused twice, ask your manager to reset it rather than guessing; repeated failures are recorded.",
            "在任意浏览器中打开该网址——手机或电脑均可。输入主管给你的邮箱和密码，然后点击登录。如果密码连续两次被拒，请让主管重置，不要反复猜测；多次失败会被记录。",
          ],
          figure: {
            shot: "login",
            crop: true,
            pins: [
              { n: 1, x: 50, y: 44 },
              { n: 2, x: 50, y: 57 },
              { n: 3, x: 50, y: 70 },
            ],
            caption: "The sign-in screen, before there is a session.",
          },
          keys: [
            {
              n: 1,
              title: ["Email", "邮箱"],
              body: [
                "Your work email, e.g. china@targetexpress.co.tz. Not a personal address.",
                "你的工作邮箱，例如 china@targetexpress.co.tz。不要使用个人邮箱。",
              ],
            },
            {
              n: 2,
              title: ["Password", "密码"],
              body: [
                "Set by management. Change it from your Profile once you are in.",
                "由管理层设置。登录后可在“个人资料”中修改。",
              ],
            },
            {
              n: 3,
              title: ["Sign in", "登录"],
              body: [
                "Takes you straight to your own department's home. There is no department to choose — the system knows who you are.",
                "直接进入你所在部门的首页。无需选择部门——系统已经知道你的身份。",
              ],
            },
          ],
          callout: {
            kind: "tip",
            text: [
              "Never share an account. Every registration, every label printed and every dispatch carries the name of whoever was signed in.",
              "切勿共用账号。每一次登记、每一张打印的标签、每一次发运，都会记录当时登录者的姓名。",
            ],
          },
        },
        {
          kind: "screen",
          title: ["Switching to Chinese", "切换到中文"],
          eyebrow: "Step 2",
          route: "Sidebar → English / 中文",
          intro: [
            "Your account opens in Chinese already. The switch sits at the bottom of the sidebar, above Sign out. Press *中文* and every screen, button, message and date becomes Chinese; press *English* and it all goes back. Your choice is stored against you, not the computer — so the bench machine in the morning and your phone in the afternoon both remember it.",
            "你的账号默认就是中文。语言切换位于侧边栏底部、退出登录上方。点击*中文*，所有界面、按钮、提示和日期都会变成中文；点击*English*则全部还原。你的选择保存在你的账号上，而不是这台电脑——所以早上用工作台电脑、下午用手机，都会记得。",
          ],
          figure: {
            shot: "home-hero",
            crop: true,
            pins: [{ n: 1, x: 10, y: 89 }],
            rings: [{ x: 1.5, y: 84, w: 18, h: 9 }],
            caption: "The language switch, bottom of the sidebar.",
          },
          keys: [
            {
              n: 1,
              title: ["English / 中文", "英文 / 中文"],
              body: [
                "Each label is written in its own language on purpose, so you can find the one you want even when the screen is in a language you cannot read.",
                "两个按钮各自用本语言书写，这样即使当前界面语言你看不懂，也能找到想要的那个。",
              ],
            },
          ],
          callout: {
            kind: "warn",
            text: [
              "What you *type* is not translated by this switch. If you write a cargo description in Chinese, the system keeps your Chinese exactly as written and shows Dar an English rendering beside it. Neither desk is ever handed the other's language.",
              "这个开关不会翻译你*输入*的内容。如果你用中文填写货物名称，系统会原样保留你的中文，并在旁边为达市提供英文译文。两个部门都不会被迫看另一种语言。",
            ],
          },
        },
      ],
    },

    // ---------------------------------------------------------------- 03
    {
      title: ["Your home screen", "你的首页"],
      blurb: [
        "The system writes your morning to-do list. Read it from the top.",
        "系统会替你写好当天的待办清单。请从上往下处理。",
      ],
      pages: [
        {
          kind: "screen",
          title: ["Home, section by section", "首页逐块讲解"],
          eyebrow: "Dashboard",
          route: "/app/dashboard · 首页",
          intro: [
            "This is the first screen every morning and the one you return to between jobs. Nothing here is decoration — every number is something you can act on.",
            "这是每天早上第一个打开、工作间隙也会回到的界面。这里没有装饰性内容——每个数字都对应一件可以去做的事。",
          ],
          figure: {
            shot: "home-hero",
            crop: true,
            pins: [
              { n: 1, x: 55, y: 14 },
              { n: 2, x: 55, y: 26 },
              { n: 3, x: 30, y: 47 },
              { n: 4, x: 62, y: 63 },
              { n: 5, x: 10, y: 30 },
            ],
            caption: "The Guangzhou home screen, reading in Chinese.",
          },
          keys: [
            {
              n: 1,
              title: ["The greeting banner", "问候横幅"],
              body: [
                "Your name, the department badge, and both clocks — China time and Tanzania time. The clocks matter: a flight time quoted in the wrong one is a missed flight.",
                "你的姓名、部门标识，以及两个时钟——中国时间和坦桑尼亚时间。时钟很重要：航班时间说错时区就会误机。",
              ],
            },
            {
              n: 2,
              title: ["Today's floor figures", "今日现场数据"],
              body: [
                "Cargo registered today, weight taken in today, labels printed today. A quick check that the day is moving.",
                "今日登记的货量、今日收货重量、今日打印的标签数。用来快速判断当天进度。",
              ],
            },
            {
              n: 3,
              title: ["Quick actions", "快捷操作"],
              body: [
                "The five things this desk does most, one press away: Receive cargo, Load a batch, Shipments, Issues & Claims, Reports.",
                "本岗位最常做的五件事，一键直达：收货登记、装批、运单、问题与索赔、报表。",
              ],
            },
            {
              n: 4,
              title: ["Needs your attention", "需要你处理"],
              body: [
                "Your job list, written by the system. Consignments with no photograph, batches left open too long, cargo waiting too many days. *Work it from the top* — it is ordered by what costs the business most.",
                "系统替你生成的待办清单：没有照片的货物、开启过久的批次、等待太久的货物。*请从上往下处理*——顺序按对公司损失大小排列。",
              ],
            },
            {
              n: 5,
              title: ["The sidebar", "侧边栏"],
              body: [
                "Everything you can reach, grouped by the kind of work. Explained in full in the next section.",
                "你可以进入的所有页面，按工作类型分组。下一节会详细讲解。",
              ],
            },
          ],
          callout: {
            kind: "warn",
            text: [
              "A consignment with *no photograph* is always the most urgent row. It is registered but has nothing to argue with — if Dar reports it damaged, there is no picture of what it looked like when it left you.",
              "*没有照片*的货物永远是最紧急的一条。它虽已登记，但没有任何凭据——如果达市报告破损，就没有照片证明它离开你时是什么样子。",
            ],
          },
        },
      ],
    },

    // ---------------------------------------------------------------- 04
    {
      title: ["The sidebar, menu by menu", "侧边栏逐项说明"],
      blurb: [
        "Nine doors. What each is, why it exists, and when you should be in it.",
        "九个入口。分别是什么、为什么存在、什么时候该用。",
      ],
      pages: [
        {
          title: ["Every menu explained", "每个菜单的用途"],
          eyebrow: "Navigation",
          blocks: [
            {
              type: "table",
              head: ["Menu", "What it is, and when to use it"],
              rows: [
                [
                  ["Home 首页", "/app/dashboard"],
                  [
                    "Your morning starting point and the attention panel. Open it first, and again whenever you finish a job.",
                    "每天的起点和提醒面板。上班先打开，每做完一件事再回来看一次。",
                  ],
                ],
                [
                  ["Search 搜索", "/app/search"],
                  [
                    "Find any consignment by tracking number, customer name, phone or description. Use it when someone asks 'where is my box'.",
                    "通过运单号、客户姓名、电话或货物名称查找任何一票货。有人问“我的货在哪”时用它。",
                  ],
                ],
                [
                  ["Requests 客户申请", "/app/requests"],
                  [
                    "Booking and pickup requests from the public website. Ring each person back and move the status along. *A request is not cargo.*",
                    "来自官网的预约和上门取件申请。逐个回电并更新状态。*申请不等于货物。*",
                  ],
                ],
                [
                  ["Receive Cargo 收货登记", "/app/cargo/new"],
                  [
                    "The registration bench. The screen you will spend most of your day on.",
                    "收货登记台。你一天中用得最多的界面。",
                  ],
                ],
                [
                  ["Batches 批次", "/app/batches"],
                  [
                    "The two permanent loading tables — Guangzhou and Hong Kong — plus the Seal & dispatch panel.",
                    "两个固定装货台——广州和香港——以及封批发运面板。",
                  ],
                ],
                [
                  ["Shipments 运单", "/app/shipments"],
                  [
                    "Everything you have ever registered and where it has got to. Read-only history.",
                    "你登记过的所有货物及其当前位置。只读的历史记录。",
                  ],
                ],
                [
                  ["Customers 客户", "/app/customers"],
                  [
                    "The customer book. The *phone number is the identity* — one number, one customer.",
                    "客户名录。*电话号码就是身份标识*——一个号码对应一个客户。",
                  ],
                ],
                [
                  ["Issues & Claims 问题与索赔", "/app/exceptions"],
                  [
                    "Cases raised against cargo you loaded. *Nothing pushes these to you* — open it at the end of every day.",
                    "针对你装载货物提出的案件。*系统不会主动通知你*——请每天下班前打开查看。",
                  ],
                ],
                [
                  ["Reports 报表", "/app/reports"],
                  [
                    "Your own numbers: registered, flown, still standing, photograph compliance. No money, by design.",
                    "你自己的数据：已登记、已发运、仍在库、拍照完成率。按设计不含任何金额。",
                  ],
                ],
              ],
            },
          ],
        },
      ],
    },

    // ---------------------------------------------------------------- 05
    {
      title: ["Every screen in detail", "各界面详解"],
      blurb: [
        "One chapter per screen: the picture, every control, and why it is there.",
        "每个界面一章：截图、每个控件、以及它存在的原因。",
      ],
      pages: [
        {
          kind: "screen",
          title: ["Receive Cargo — the registration bench", "收货登记——登记台"],
          eyebrow: "The screen you use most",
          route: "/app/cargo/new · 收货登记",
          intro: [
            "Five sections, worked top to bottom. The system does the routing, the batch assignment and the price on its own — your job is the customer, the goods, the scale and the camera.",
            "五个部分，从上往下依次填写。航线、批次和价格由系统自动判断——你负责的是客户、货物、称重和拍照。",
          ],
          figure: {
            shot: "receive-cargo-hero",
            crop: true,
            pins: [
              { n: 1, x: 60, y: 22 },
              { n: 2, x: 46, y: 31 },
              { n: 3, x: 60, y: 41 },
              { n: 4, x: 60, y: 65 },
              { n: 5, x: 60, y: 89 },
            ],
            caption: "收货登记 — sections 1 and 2 of the registration form.",
          },
          keys: [
            {
              n: 1,
              title: ["1. Customer 客户"],
              body: [
                "Find an existing customer, or create one. Search by name, shipping mark, phone or customer code.",
                "查找已有客户，或新建客户。可按姓名、唛头、电话或客户编号搜索。",
              ],
            },
            {
              n: 2,
              title: ["Find / New 查找 / 新客户"],
              body: [
                "Always search first. A customer entered twice is two histories, two balances, and a phone call to sort out.",
                "务必先搜索。同一个客户录入两次，就会产生两份历史、两个余额，还要打电话去处理。",
              ],
            },
            {
              n: 3,
              title: ["Search field 搜索框"],
              body: [
                "The phone number is the surest match. Names are typed differently by different people; a number is a number.",
                "电话号码是最可靠的匹配方式。不同的人写名字方式不同，但号码就是号码。",
              ],
            },
            {
              n: 4,
              title: ["2. Cargo category 货物类别"],
              body: [
                "One choice, and the system works out the airport and the price from it. Normal goods, Electronics, or Liquid & special goods.",
                "只需选一项，系统据此判断机场和价格。普通货物、电子产品，或液体及特殊货物。",
              ],
            },
            {
              n: 5,
              title: ["Route 航线"],
              body: [
                "Shown, not chosen. Electronics normally fly from Hong Kong; everything else from Guangzhou. The category decides it.",
                "只显示、不选择。电子产品通常从香港发出，其他从广州发出。由类别自动决定。",
              ],
            },
          ],
          callout: {
            kind: "stop",
            text: [
              "*Weigh before you type.* A weight typed from memory is the number the customer is billed on. At least one photograph is required by the server, not just by the form — the save is refused outright without one.",
              "*先称重，再录入。* 凭记忆填写的重量，就是客户被收费的依据。至少一张照片是服务器强制要求的，不只是表单校验——没有照片直接拒绝保存。",
            ],
          },
        },
        {
          kind: "screen",
          title: ["Batches — the loading tables", "批次——装货台"],
          eyebrow: "Loading and dispatch",
          route: "/app/batches · 批次",
          intro: [
            "Two permanent tables, one per airport. Cargo lands on the right one automatically when you register it. Read the four tiles before you seal anything.",
            "两个固定装货台，每个机场一个。登记时货物会自动落到正确的台上。封批前请先看四个数据块。",
          ],
          figure: {
            shot: "batches-hero",
            crop: true,
            pins: [
              { n: 1, x: 30, y: 30 },
              { n: 2, x: 72, y: 30 },
              { n: 3, x: 50, y: 62 },
            ],
            caption: "The Guangzhou and Hong Kong loading tables.",
          },
          keys: [
            {
              n: 1,
              title: ["Guangzhou table 广州台"],
              body: [
                "Normal goods and liquids. Cargo waiting, total weight, customers, and the oldest piece on the table.",
                "普通货物和液体。显示待运货量、总重量、客户数，以及台上最久的一件。",
              ],
            },
            {
              n: 2,
              title: ["Hong Kong table 香港台"],
              body: [
                "Electronics. Same four figures. Assignment is automatic — you should never have to move a piece between tables.",
                "电子产品。同样四个数据。分配是自动的——正常情况下你不需要在两个台之间搬动货物。",
              ],
            },
            {
              n: 3,
              title: ["Seal & dispatch 封批发运"],
              body: [
                "Waybill number and airline are both required, plus flight, departure date and expected arrival. This moves every piece onto the flight at once.",
                "空运单号和航空公司为必填，另需航班号、起飞日期和预计到达。此操作会一次性把台上所有货物装上航班。",
              ],
            },
          ],
          callout: {
            kind: "stop",
            text: [
              "*There is no un-dispatch.* After sealing you can no longer edit or delete any of that cargo. Read the table one more time first — the oldest-piece figure and the misroute flag are there precisely for that last look.",
              "*发运无法撤销。* 封批后你将无法再编辑或删除这些货物。请再核对一遍——“最久一件”和错线提示就是为这最后一眼准备的。",
            ],
          },
        },
        {
          kind: "screen",
          title: ["Search — finding one box", "搜索——找到某一票货"],
          eyebrow: "Lookup",
          route: "/app/search · 搜索",
          intro: [
            "Four ways in: a tracking number, a customer name, a phone number, or the carton reference off the packing list. Partial matches work — you do not need the whole thing.",
            "四种查找方式：运单号、客户姓名、电话号码，或装箱单上的箱号。支持模糊匹配——不需要输入完整内容。",
          ],
          figure: {
            shot: "search-hero",
            crop: true,
            caption: "The shared search screen.",
          },
          keys: [
            {
              n: 1,
              title: ["What you can type", "可以输入什么"],
              body: [
                "TX-000125, a carton reference like GZ/26-28-7, part of a customer's name, or a phone number in any of the forms people write it.",
                "TX-000125、类似 GZ/26-28-7 的箱号、客户姓名的一部分，或任意书写格式的电话号码。",
              ],
            },
            {
              n: 2,
              title: ["What you will not see", "你看不到什么"],
              body: [
                "No prices and no camera scanner. Scanning belongs to the Dar counter; this desk prints labels and never reads them.",
                "没有价格，也没有摄像头扫码。扫码属于达市柜台；本岗位只打印标签，不扫描。",
              ],
            },
          ],
        },
        {
          kind: "screen",
          title: ["Requests — the website queue", "客户申请——官网队列"],
          eyebrow: "Call these people back",
          route: "/app/requests · 客户申请",
          intro: [
            "Booking and pickup requests submitted on the public site. Ring each person, agree what is happening, and move the status: pending, contacted, scheduled, completed — or cancelled.",
            "客户在官网提交的预约和上门取件申请。逐个致电、确认安排，并更新状态：待处理、已联系、已安排、已完成——或已取消。",
          ],
          figure: { shot: "requests-hero", crop: true },
          keys: [
            {
              n: 1,
              title: ["A request is not a shipment", "申请不是运单"],
              body: [
                "It can never become one by itself. Cargo is registered when the boxes are physically on your counter and somebody has weighed them.",
                "申请不会自动变成运单。只有当箱子实际到达柜台并完成称重时，才登记为货物。",
              ],
            },
          ],
        },
        {
          kind: "screen",
          title: ["Customers — the book", "客户——名录"],
          eyebrow: "One number, one customer",
          route: "/app/customers · 客户",
          intro: [
            "Every customer who has ever shipped with us, newest first. Created automatically the first time cargo is registered against a name or number.",
            "所有曾发过货的客户，按最新排列。首次以某个姓名或号码登记货物时自动创建。",
          ],
          figure: { shot: "customers-hero", crop: true },
          keys: [
            {
              n: 1,
              title: ["Search before you create", "先搜索，再新建"],
              body: [
                "The phone number is the identity. Creating a second record for the same person splits their history in half and neither half is right.",
                "电话号码就是身份标识。为同一个人重复建档会把历史一分为二，两边都不完整。",
              ],
            },
          ],
        },
        {
          kind: "screen",
          title: ["Issues & Claims", "问题与索赔"],
          eyebrow: "Answer for what you loaded",
          route: "/app/exceptions · 问题与索赔",
          intro: [
            "Cases raised against cargo you registered. You cannot open, approve or close a case — you answer one question, better than anyone else can: *was it loaded in Guangzhou?* Your photographs, your weight and your carton count are the evidence.",
            "针对你登记货物提出的案件。你不能开立、批准或结案——你只回答一个别人无法替你回答的问题：*这票货在广州装了吗？* 你的照片、重量和箱数就是证据。",
          ],
          figure: { shot: "issues-hero", crop: true },
          callout: {
            kind: "warn",
            text: [
              "*Nothing pushes these cases to you.* The notifications go to Customer Care, Finance and management. Make opening this page part of the end of every day.",
              "*系统不会主动把案件推送给你。* 通知只会发给客服、财务和管理层。请把每天下班前查看此页面变成习惯。",
            ],
          },
        },
        {
          kind: "screen",
          title: ["Reports — your own numbers", "报表——你自己的数据"],
          eyebrow: "How the floor is doing",
          route: "/app/reports · 报表",
          intro: [
            "Registered, flown, still standing, and the photograph compliance ring. Change the period at the top. There is no money on this report, by design — warehouse staff are measured on cargo and time.",
            "已登记、已发运、仍在库，以及拍照完成率。可在顶部切换统计周期。按设计本报表不含任何金额——仓库岗位以货量和时效衡量。",
          ],
          figure: { shot: "reports-hero", crop: true },
        },
      ],
    },

    // ---------------------------------------------------------------- 06
    {
      title: ["The complete journey", "完整流程"],
      blurb: [
        "One box, from a supplier in Guangzhou to a customer's hands in Dar es Salaam.",
        "一个箱子，从广州的供应商到达累斯萨拉姆客户手中。",
      ],
      pages: [
        {
          title: ["Fifteen steps, five departments", "十五步，五个部门"],
          eyebrow: "End to end",
          blocks: [
            {
              type: "flow",
              steps: [
                { who: "Customer 客户", what: ["Books on the website", "在官网下单"], tone: "draft" },
                { who: "Guangzhou 广州", what: ["Rings the customer back", "回电确认"], tone: "draft" },
                { who: "Guangzhou 广州", what: ["Cargo arrives at the warehouse", "货物到仓"], tone: "draft" },
                { who: "Guangzhou 广州", what: ["Weigh · photograph · register", "称重 · 拍照 · 登记"], tone: "info",
                  note: ["Tracking number and QR labels are created here.", "运单号和二维码标签在此生成。"] },
                { who: "Guangzhou 广州", what: ["Print labels, stick on every box", "打印标签，逐箱粘贴"], tone: "info" },
                { who: "Guangzhou 广州", what: ["Cargo joins a loading table", "货物进入装货台"], tone: "info" },
                { who: "Guangzhou 广州", what: ["Seal and dispatch onto the flight", "封批并发运上机"], tone: "info",
                  note: ["Cannot be undone. Your part ends here.", "不可撤销。你的工作到此结束。"] },
                { who: "In the air 空运中", what: ["China → Tanzania", "中国 → 坦桑尼亚"], tone: "owed" },
                { who: "Dar floor 达市仓", what: ["Flight lands, batch marked arrived", "航班落地，批次标记到达"], tone: "owed" },
                { who: "Dar floor 达市仓", what: ["Check in against the manifest", "按舱单核对入库"], tone: "owed" },
                { who: "System 系统", what: ["Cargo priced automatically", "系统自动计价"], tone: "owed" },
                { who: "Finance 财务", what: ["Confirm the price → invoice", "确认价格 → 生成账单"], tone: "owed" },
                { who: "Customer Care 客服", what: ["Chase the customer for payment", "催收客户款项"], tone: "owed" },
                { who: "Finance 财务", what: ["Verify payment · issue pickup note", "核实收款 · 开具提货单"], tone: "paid" },
                { who: "Dar floor 达市仓", what: ["Scan · photograph · hand over", "扫码 · 拍照 · 交货"], tone: "paid" },
              ],
            },
          ],
        },
      ],
    },

    // ---------------------------------------------------------------- 07
    {
      title: ["A worked example", "实例演练"],
      blurb: [
        "One real consignment, followed all the way through.",
        "跟随一票真实货物，走完全程。",
      ],
      pages: [
        {
          title: ["TX-000042 · shoes for John Peter", "TX-000042 · John Peter 的鞋子"],
          eyebrow: "Follow it through",
          blocks: [
            {
              type: "example",
              fields: [
                { k: "Customer", v: "John Peter" },
                { k: "Tracking", v: "TX-000042" },
                { k: "Weight", v: "3.6 kg" },
                { k: "Cargo", v: "Shoes 鞋子" },
              ],
            },
            {
              type: "table",
              head: ["Stage", "What happens, and who does it"],
              rows: [
                [
                  ["At your bench", "在你的工作台"],
                  [
                    "John's boxes arrive. You search 0764 197 748, find him, pick *Normal goods*, weigh 3.6 kg, count 2 cartons, type 鞋子, take two photographs and save. The system creates TX-000042 and two labels: TX-000042-P1 and -P2.",
                    "John 的货到了。你搜索 0764 197 748 找到他，选择*普通货物*，称得 3.6 公斤，数出 2 箱，填写“鞋子”，拍两张照片并保存。系统生成 TX-000042 及两张标签：TX-000042-P1 和 -P2。",
                  ],
                ],
                [
                  ["Labels", "贴标"],
                  [
                    "You print both stickers and attach one to each box before they leave the bench.",
                    "打印两张贴纸，在箱子离开工作台前分别贴好。",
                  ],
                ],
                [
                  ["Loading", "装台"],
                  [
                    "Shoes are normal goods, so it lands on the Guangzhou table automatically.",
                    "鞋子属于普通货物，因此自动落到广州装货台。",
                  ],
                ],
                [
                  ["Dispatch", "发运"],
                  [
                    "You seal the table with waybill 176-44821905 on Ethiopian Airlines ET605. TX-000042 is now beyond your reach.",
                    "你以空运单号 176-44821905、埃塞俄比亚航空 ET605 封批。此后 TX-000042 你无法再修改。",
                  ],
                ],
                [
                  ["Dar", "达市"],
                  [
                    "Both boxes are ticked in against the manifest. The system prices it: 3.6 kg × USD 13.50 = USD 48.60.",
                    "两箱按舱单核对入库。系统计价：3.6 公斤 × 13.50 美元 = 48.60 美元。",
                  ],
                ],
                [
                  ["Money", "收款"],
                  [
                    "Finance confirms the price, Customer Care rings John, John pays, Finance verifies and issues pickup note PN-2026-000042.",
                    "财务确认价格，客服致电 John，John 付款，财务核实并开具提货单 PN-2026-000042。",
                  ],
                ],
                [
                  ["Collected", "提货"],
                  [
                    "John comes to the counter. The clerk scans one carton, both boxes are accounted for, a handover photo is taken, and TX-000042 is delivered.",
                    "John 到柜台。柜员扫描其中一箱，两箱都核对齐全，拍摄交接照片，TX-000042 完成交付。",
                  ],
                ],
              ],
            },
          ],
        },
      ],
    },

    // ---------------------------------------------------------------- 08
    {
      title: ["When things go wrong", "出问题的时候"],
      blurb: [
        "The mistakes that actually happen here, and what to do about each.",
        "这里真正会发生的错误，以及各自的处理方法。",
      ],
      pages: [
        {
          title: ["Common mistakes", "常见错误"],
          eyebrow: "Fix it this way",
          blocks: [
            {
              type: "table",
              head: ["The mistake", "What it causes", "What to do"],
              rows: [
                [
                  ["Weight typed from memory", "凭记忆填重量"],
                  ["The customer is billed on a number nobody measured.", "客户按无人测量的数字被收费。"],
                  ["Re-weigh and correct it while the cargo is still in China.", "货物仍在中国时重新称重并更正。"],
                ],
                [
                  ["One label on two boxes", "一张标签贴两箱"],
                  ["Two boxes with one identity — nobody can say which went missing.", "两箱共用一个身份——无法判断丢的是哪一箱。"],
                  ["Reprint from the consignment and re-label. Never copy a sticker.", "从该运单重新打印并贴标。切勿复制贴纸。"],
                ],
                [
                  ["No photograph", "没有照片"],
                  ["A damage claim arrives and you have nothing to answer it with.", "收到破损索赔时你无凭据可依。"],
                  ["Open the consignment and add photos before it flies.", "在发运前打开该运单补拍照片。"],
                ],
                [
                  ["Customer entered twice", "客户重复建档"],
                  ["History and balance split across two records.", "历史和余额被拆成两份。"],
                  ["Search by phone first. Tell management to merge duplicates.", "先按电话搜索。发现重复请报管理层合并。"],
                ],
                [
                  ["Registering a website request", "把官网申请当货登记"],
                  ["A tracking number exists for boxes nobody has seen.", "为没人见过的箱子生成了运单号。"],
                  ["Register only when the boxes are on the counter.", "只有箱子到柜台时才登记。"],
                ],
                [
                  ["Sealing without reading", "不核对就封批"],
                  ["Wrong cargo flies, and it cannot be undone.", "错误货物被发运，且不可撤销。"],
                  ["Check the four tiles and any misroute flag, then dispatch.", "先看四个数据块和错线提示，再发运。"],
                ],
                [
                  ["Never opening Issues & Claims", "从不查看问题与索赔"],
                  ["Cases about your cargo sit unanswered; nothing notifies you.", "关于你货物的案件无人回应；系统不会提醒你。"],
                  ["Check it at the end of every day.", "每天下班前查看一次。"],
                ],
              ],
            },
          ],
        },
      ],
    },

    // ---------------------------------------------------------------- 09
    {
      title: ["Working well", "把工作做好"],
      blurb: ["Habits that make the whole chain easier.", "让整条链条更顺畅的习惯。"],
      pages: [
        {
          title: ["Best practice", "最佳实践"],
          eyebrow: "Do it this way",
          blocks: [
            {
              type: "cards",
              columns: 2,
              items: [
                {
                  label: "Scale first",
                  title: ["Weigh, then type", "先称重，后录入"],
                  body: [
                    "Every figure downstream is the one you measured. Nobody checks it again.",
                    "下游所有数据都来自你测的这个数。没有人会再核一遍。",
                  ],
                },
                {
                  label: "Photograph",
                  title: ["Two pictures, always", "始终拍两张"],
                  body: [
                    "One of the goods, one of the packed box. It costs ten seconds and settles arguments months later.",
                    "一张拍货物，一张拍装好的箱子。只花十秒，却能在几个月后平息争议。",
                  ],
                },
                {
                  label: "Label",
                  title: ["Stick before it moves", "移动前先贴标"],
                  body: [
                    "A box that leaves the bench unlabelled is a box nobody can identify.",
                    "未贴标就离开工作台的箱子，之后无人能识别。",
                  ],
                },
                {
                  label: "Batches",
                  title: ["Do not let a table age", "不要让装货台久放"],
                  body: [
                    "A table left open stops being a batch and becomes a shelf. Watch the oldest-piece figure.",
                    "长期开着的装货台就不再是批次，而变成了货架。注意“最久一件”这个数字。",
                  ],
                },
                {
                  label: "Language",
                  title: ["Type in Chinese freely", "放心用中文录入"],
                  body: [
                    "Your Chinese is kept exactly as written, and Dar is shown an English rendering beside it.",
                    "你的中文会被原样保留，达市看到的是旁边的英文译文。",
                  ],
                },
                {
                  label: "End of day",
                  title: ["Two pages before you leave", "下班前看两个页面"],
                  body: [
                    "Issues & Claims, then Reports. Five minutes, and nothing is left hanging overnight.",
                    "先看问题与索赔，再看报表。五分钟，不留隔夜问题。",
                  ],
                },
              ],
            },
          ],
        },
      ],
    },

    // ---------------------------------------------------------------- 10
    {
      title: ["Questions people ask", "常见问题"],
      blurb: ["The ones that come up in the first week.", "第一周里最常被问到的问题。"],
      pages: [
        {
          title: ["Frequently asked", "常见问答"],
          eyebrow: "FAQ",
          blocks: [
            {
              type: "table",
              head: ["Question", "Answer"],
              rows: [
                [
                  ["I typed the wrong weight. Can I fix it?", "重量填错了，能改吗？"],
                  [
                    "Yes, while the cargo is still in China. Open the consignment and press Edit. After dispatch you cannot — ask management.",
                    "可以，只要货物还在中国。打开该运单点击编辑。发运后无法修改——请联系管理层。",
                  ],
                ],
                [
                  ["I registered the same boxes twice.", "同一批箱子登记了两次。"],
                  [
                    "Delete the duplicate from the panel at the foot of the edit page and write why. Nothing is truly destroyed — the photos and history survive.",
                    "在编辑页面底部的面板中删除重复项并写明原因。数据不会真正被销毁——照片和历史都会保留。",
                  ],
                ],
                [
                  ["Why can I not see the price?", "为什么我看不到价格？"],
                  [
                    "By design. Pricing is Finance's. A rate box on this form would put pricing in the hands of whoever is holding the scale.",
                    "这是设计如此。定价属于财务。如果这张表上有价格栏，定价权就落到拿秤的人手里。",
                  ],
                ],
                [
                  ["A customer has no phone number.", "客户没有电话号码。"],
                  [
                    "You can still register. The record is flagged so somebody confirms it before the cargo lands.",
                    "仍然可以登记。系统会标记该记录，以便有人在货物到港前补齐。",
                  ],
                ],
                [
                  ["The system says my cargo is on the wrong table.", "系统提示我的货在错误的装货台。"],
                  [
                    "Assignment is automatic, so that warning should be impossible. Check the cargo category before dismissing it.",
                    "分配是自动的，正常不该出现此提示。忽略之前请先检查货物类别。",
                  ],
                ],
                [
                  ["Can I use my phone instead of the computer?", "可以用手机代替电脑吗？"],
                  [
                    "Yes. Every screen works on a phone, and the camera is the easiest way to take the cargo photographs.",
                    "可以。所有界面都支持手机，而且用手机相机拍货物照片最方便。",
                  ],
                ],
              ],
            },
          ],
        },
      ],
    },

    // ---------------------------------------------------------------- 11
    {
      title: ["Summary", "本岗位小结"],
      blurb: ["What to remember when everything else has been forgotten.", "即使其他都忘了，也要记住这些。"],
      pages: [
        {
          title: ["The Guangzhou desk in one page", "一页看懂广州岗位"],
          eyebrow: "Keep this one",
          blocks: [
            {
              type: "cards",
              columns: 3,
              items: [
                {
                  label: "Every day",
                  title: ["Do", "该做"],
                  body: [
                    "Read the attention panel first · weigh before typing · photograph everything · one label per box · check Issues & Claims before you leave.",
                    "先看提醒面板 · 先称重再录入 · 每票都拍照 · 每箱一张标签 · 下班前查看问题与索赔。",
                  ],
                },
                {
                  label: "Never",
                  title: ["Don't", "不该做"],
                  body: [
                    "Guess a weight · copy a label onto a second box · register a website request as cargo · seal a table without reading it · share your account.",
                    "凭感觉填重量 · 把标签复制到第二个箱子 · 把官网申请当货登记 · 不核对就封批 · 共用账号。",
                  ],
                },
                {
                  label: "Remember",
                  title: ["The rule", "核心原则"],
                  body: [
                    "Nobody downstream can fix what you get wrong. The scale, the camera and the label are the whole job.",
                    "下游没有人能纠正你这里的错误。秤、相机和标签就是这份工作的全部。",
                  ],
                },
              ],
            },
            {
              type: "callout",
              kind: "tip",
              label: "If you remember one sentence",
              text: [
                "Get the weight, the count and the picture right, and every desk after yours can do its job.",
                "把重量、件数和照片做对，后面每一个岗位才能把事做好。",
              ],
            },
          ],
        },
      ],
    },
  ],
};
