/**
 * Management (CEO / Admin) — staff training manual.
 * English + Simplified Chinese.
 */

export default {
  department: ["Management", "管理层"],
  version: "1.0",
  labels: {
    version: ["Version", "版本"],
    languages: ["Languages", "语言"],
    audience: ["For", "适用对象"],
    issued: ["Issued", "签发"],
  },
  languages: "English · 简体中文",
  audience: "CEO and administrators",
  issued: "August 2026",
  contentsAlt: "目录",

  callouts: {
    stop: ["Never do this", "切勿这样做"],
    warn: ["Careful", "注意"],
    tip: ["Tip", "提示"],
    note: ["Note", "说明"],
  },

  sections: [
    {
      title: ["The chair that answers for everything", "对全公司负责的岗位"],
      blurb: [
        "One seat answers for Guangzhou, the Dar floor, Finance and Customer Care at once.",
        "一个岗位同时对广州仓、达市仓、财务和客服负责。",
      ],
      pages: [
        {
          title: ["What this chair is for", "这个岗位的职责"],
          eyebrow: ["Mission", "使命"],
          blocks: [
            {
              type: "text",
              text: [
                "This chair exists to read the whole business on one screen and to sign off the decisions nobody else may take — *not to run the daily operation*. If you find yourself registering cargo or releasing boxes, something upstream needs attention instead.",
                "这个岗位的存在，是为了在一块屏幕上看清整个业务，并签署其他人无权做出的决定——*而不是去做日常操作*。如果你发现自己在登记货物或放货，说明上游有问题需要处理。",
              ],
            },
            {
              type: "cards",
              columns: 2,
              items: [
                {
                  label: ["Yours alone", "只有你能做"],
                  title: ["The decisions with a cost attached", "带有成本的决定"],
                  body: [
                    "Compensation payouts, costs above the threshold, staff and their access, the prices customers are told, and permanent deletion. No other role holds any of these — not even Finance.",
                    "赔偿支付、超过额度的支出、员工及其权限、对客户报出的价格，以及永久删除。其他任何角色都没有这些权限——财务也没有。",
                  ],
                },
                {
                  label: ["Deliberately split", "刻意分开"],
                  title: ["Approving is never paying", "审批不等于付款"],
                  body: [
                    "You approve a payout; Finance disburses it. You approve a cost; Finance's payment is what actually moves money. *One desk deciding and paying is how money leaves a business quietly.*",
                    "你批准赔付，财务执行支付。你批准支出，真正动钱的是财务的付款操作。*一个岗位既决定又付款，是公司资金悄悄流失的方式。*",
                  ],
                },
              ],
            },
            {
              type: "table",
              head: [["Your day", "你的一天"], ["What it means", "含义"]],
              rows: [
                [["Land on the executive view", "进入管理层视图"], ["A dashboard no other role sees.", "其他角色看不到的仪表盘。"]],
                [["Read what needs a decision", "看需要你决定的事"], ["Grouped by the desk that owns the fix, ranked by severity.", "按负责解决的岗位分组，按严重程度排序。"]],
                [["Scan every desk", "扫视各个岗位"], ["Four cards. Read the problem line, not the figure.", "四张卡片。看问题描述，而不是数字。"]],
                [["Clear the case decisions", "处理案件决定"], ["Compensation and assignment are yours alone.", "赔偿和指派只有你能做。"]],
                [["Sign off the big costs", "签批大额支出"], ["Approving books no money. It only unlocks the payment.", "审批本身不入账。它只是解锁付款。"]],
                [["Read the position", "查看经营状况"], ["Cash available, then what the business actually earned.", "可用现金，以及公司实际赚了多少。"]],
              ],
            },
          ],
        },
        {
          title: ["What you may and may not do", "你的权限范围"],
          eyebrow: ["Authority", "权限"],
          blocks: [
            {
              type: "cards",
              columns: 2,
              items: [
                {
                  label: ["You may", "你可以"],
                  title: ["See everything, decide the rest", "看到全部，决定其余"],
                  body: [
                    "Every screen in the system · approve compensation and assign a case · approve any cost above the threshold · read the profit and loss (withheld even from Finance) · create staff, change roles, reset passwords, switch access off · restore a deleted consignment or erase one permanently · change the collection accounts, offices and numbers customers see.",
                    "系统中的每一个界面 · 批准赔偿并指派案件 · 批准任何超额支出 · 查看损益表（连财务都看不到）· 创建员工、变更角色、重置密码、停用权限 · 恢复已删除货物或永久清除 · 修改客户看到的收款账户、办公地址和联系电话。",
                  ],
                },
                {
                  label: ["You may not", "你不可以"],
                  title: ["Lock yourself out, or rewrite the record", "把自己锁在外面，或改写记录"],
                  body: [
                    "Deactivate your own account · change your own role · edit or delete anything in the audit log, including your own actions · approve a payout twice or on a finished case · erase a record that still has an invoice, or that flew on a dispatched batch · erase anything without typing its tracking number exactly.",
                    "停用自己的账号 · 修改自己的角色 · 编辑或删除审计日志中的任何内容，包括你自己的操作 · 对同一案件重复批准赔付，或对已结案件批准 · 清除仍有账单的记录，或已随航班发运的记录 · 未准确输入运单号就清除任何记录。",
                  ],
                },
              ],
            },
            {
              type: "callout",
              kind: "tip",
              label: ["Why the limits exist", "为什么有这些限制"],
              text: [
                "*These constraints exist because you are the one person nobody can overrule.* They are what make the record worth trusting when you are the one being asked to explain it.",
                "*这些限制之所以存在，是因为你是唯一没有人能推翻的人。* 当有人要求你解释某个数字时，正是这些限制让记录值得信任。",
              ],
            },
          ],
        },
      ],
    },

    {
      title: ["Signing in", "登录系统"],
      blurb: ["One address, one account, and a view no one else has.", "一个网址、一个账号，以及别人没有的视角。"],
      pages: [
        {
          kind: "screen",
          title: ["The login screen", "登录界面"],
          eyebrow: ["Step 1", "第一步"],
          route: "target-epress.vercel.app",
          intro: [
            "Type your work email and password. You land on the executive dashboard — the only role that sees it. The language switch sits at the bottom of the sidebar; press 中文 and the whole system follows.",
            "输入工作邮箱和密码。你将进入管理层仪表盘——只有这个角色能看到。语言切换位于侧边栏底部；点击中文，整个系统随之切换。",
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
            { n: 1, title: ["Email", "邮箱"], body: ["e.g. ceo@targetexpress.co.tz", "例如 ceo@targetexpress.co.tz"] },
            { n: 2, title: ["Password", "密码"], body: ["Change it from Profile. You cannot lock yourself out — the system refuses that by name.", "可在“个人资料”中修改。你无法把自己锁在外面——系统会明确拒绝。"] },
            { n: 3, title: ["Sign in", "登录"], body: ["Straight to the executive dashboard.", "直接进入管理层仪表盘。"] },
          ],
          callout: {
            kind: "stop",
            text: [
              "Never share this account. It is the only one that can approve a payout, change a rate customers are quoted, or erase a record permanently — and every one of those carries your name for good.",
              "切勿共用此账号。它是唯一可以批准赔付、修改对客户报价的费率、或永久清除记录的账号——而这些操作都会永久记录你的姓名。",
            ],
          },
        },
      ],
    },

    {
      title: ["The executive dashboard", "管理层仪表盘"],
      blurb: ["Every desk at once, with the problems surfaced rather than the totals.", "一次看清所有岗位，突出的是问题而不是总数。"],
      pages: [
        {
          kind: "screen",
          title: ["Home, section by section", "首页逐块讲解"],
          eyebrow: ["Dashboard", "仪表盘"],
          route: "/app/dashboard",
          intro: [
            "This screen answers the three questions only this chair asks: where is all of it, how is each desk, and is the money keeping up.",
            "这个界面回答只有这个岗位会问的三个问题：货都在哪里、各岗位状况如何、资金是否跟得上。",
          ],
          figure: {
            shot: "home-hero",
            crop: true,
            pins: [
              { n: 1, x: 55, y: 16 },
              { n: 2, x: 55, y: 38 },
              { n: 3, x: 55, y: 62 },
              { n: 4, x: 55, y: 82 },
            ],
          },
          keys: [
            {
              n: 1,
              title: ["The greeting banner", "问候横幅"],
              body: [
                "Your name and the CEO badge. *The Receive cargo and Scan & release buttons are not your job* — they render because you hold those permissions, not because you should use them.",
                "你的姓名和总经理标识。*“收货登记”和“扫码放货”按钮不是你的工作*——它们出现是因为你拥有权限，而不是因为你该使用。",
              ],
            },
            {
              n: 2,
              title: ["Needs your decision", "需要你决定"],
              body: [
                "One bounded, filterable panel grouped by the desk that owns the fix — Guangzhou, Dar floor, Finance, Support, Cases — ranked critical, warning, info. It never grows into an endless stack.",
                "一个有边界、可筛选的面板，按负责解决的岗位分组——广州、达市仓、财务、客服、案件——按紧急、警告、提示排序。它不会变成无止境的长列表。",
              ],
            },
            {
              n: 3,
              title: ["Every desk, right now", "各岗位实时状况"],
              body: [
                "Four cards: Guangzhou, the Dar floor, Finance, Customer Care. *Read the problem line, not just the figure.* A high number with no problem line is a busy desk working properly.",
                "四张卡片：广州、达市仓、财务、客服。*看问题描述，不要只看数字。* 数字大但没有问题描述，说明这个岗位只是忙碌且运转正常。",
              ],
            },
            {
              n: 4,
              title: ["Business health", "经营状况"],
              body: [
                "Revenue this month, outstanding, delivered, and the three-day promise. Shillings lead; the dollar figure is what the invoice says.",
                "本月收入、未收款、已交付，以及三天承诺达成率。以先令为主；美元金额是账单上的数字。",
              ],
            },
          ],
          callout: {
            kind: "tip",
            text: [
              "An empty panel says *“Nothing needs your decision. Every desk is clear.”* That is a real statement, worded deliberately differently from a panel that failed to load.",
              "面板为空时会显示*“没有需要你决定的事项，各岗位均正常。”* 这是一句真实的结论，措辞刻意区别于加载失败的界面。",
            ],
          },
        },
      ],
    },

    {
      title: ["The sidebar, menu by menu", "侧边栏逐项说明"],
      blurb: ["You can reach every screen. These are the ones only you can use.", "你可以进入所有界面。以下是只有你能使用的。"],
      pages: [
        {
          title: ["The screens only you can use", "只有你能使用的界面"],
          eyebrow: ["Navigation", "导航"],
          blocks: [
            {
              type: "table",
              head: [["Menu", "菜单"], ["What it is, and when to use it", "它是什么，何时使用"]],
              rows: [
                [["Issues & Claims", "/app/exceptions"], ["Approving a payout and assigning a case. Yours alone.", "批准赔付和指派案件。只有你能做。"]],
                [["Expenses", "/app/finance/expenses"], ["Signing off costs above the threshold before they can be paid.", "在支付前签批超额支出。"]],
                [["Reports · Profit & loss", "/app/finance/reports"], ["What the business earned, on both bases. Withheld even from Finance.", "公司实际盈利，按两种口径列示。连财务都看不到。"]],
                [["Staff", "/app/admin/users"], ["Accounts, roles, passwords and access. You cannot alter your own.", "账号、角色、密码和权限。你不能修改自己的。"]],
                [["Deleted records", "/app/admin/deleted"], ["Restore a deletion, or erase it permanently under four conditions.", "恢复已删除记录，或在满足四个条件下永久清除。"]],
                [["Company settings", "/app/admin/settings"], ["Collection accounts, offices and numbers — what customers are told.", "收款账户、办公地址和电话——即客户看到的信息。"]],
                [["Price Configuration", "/app/finance/pricing"], ["The rate book every quote in the business comes from.", "全公司所有报价的来源费率表。"]],
                [["China markets", "/app/admin/markets"], ["The market directory Customer Care reads from.", "客服查阅的市场目录。"]],
                [["Audit log", "/app/admin/audit"], ["Every privileged action. Append-only, including for you.", "每一项特权操作。只增不改，对你也一样。"]],
                [["General ledger", "/app/finance"], ["Cash available, derived from the ledger and never typed.", "可用现金，由账目推导得出，从不手工填写。"]],
              ],
            },
          ],
        },
      ],
    },

    {
      title: ["Every screen in detail", "各界面详解"],
      blurb: ["The picture, every control, and why it is there.", "截图、每个控件、以及它存在的原因。"],
      pages: [
        {
          kind: "screen",
          title: ["Issues & Claims — the decisions only you make", "问题与索赔——只有你能做的决定"],
          eyebrow: ["Approve, or assign", "批准或指派"],
          route: "/app/exceptions",
          intro: [
            "Approve a payout, or assign a case to a named person. Both are yours alone — Customer Care and the warehouses can move a case along and gather evidence, but neither can decide it. Closing a case needs a resolution written down.",
            "批准赔付，或把案件指派给具体的人。这两项只有你能做——客服和仓库可以推进案件、收集证据，但都不能决定。结案必须写明处理结果。",
          ],
          figure: { shot: "issues-hero", crop: true },
          keys: [
            { n: 1, title: ["Approve payout", "批准赔付"], body: ["Refused on a finished case, and refused a second time on the same case.", "已结案件无法批准，同一案件也无法重复批准。"] },
            { n: 2, title: ["Assign to someone", "指派给某人"], body: ["Puts a name against the investigation so it stops being everyone's problem.", "为调查指定负责人，避免变成人人有责、无人负责。"] },
            { n: 3, title: ["Finance disburses", "财务执行支付"], body: ["You approve; they pay. The two are deliberately different desks.", "你批准，他们付款。这是刻意分开的两个岗位。"] },
          ],
          callout: {
            kind: "warn",
            text: [
              "*Approving books no money.* It only unlocks the payout for Finance to make. Confirm both halves happened before you consider a claim closed.",
              "*批准本身不入账。* 它只是解锁，供财务去支付。在认定案件了结前，请确认两个环节都已完成。",
            ],
          },
        },
        {
          kind: "screen",
          title: ["Profit & loss — the report withheld from Finance", "损益表——财务也看不到的报表"],
          eyebrow: ["What the business earned", "公司赚了多少"],
          route: "/app/finance/reports",
          intro: [
            "Two bases side by side: what the work earned (bills raised and costs incurred) and what actually moved (money in and out). *They always disagree, and both are true.*",
            "两种口径并列：业务实际赚到的（已开账单和已发生成本），以及实际动了的钱（收支）。*两者永远不一致，而且都是对的。*",
          ],
          figure: { shot: "reports-hero", crop: true },
          callout: {
            kind: "stop",
            text: [
              "*Quoting the cash figure as profit in a month with a big collection is how a bad month reads as a good one.* Say which basis you mean, every time.",
              "*在某个月收回大额欠款时，把现金口径当作利润，会让糟糕的月份看起来很好。* 每次都要说明你用的是哪个口径。",
            ],
          },
        },
        {
          kind: "screen",
          title: ["Staff — people and access", "员工——人员与权限"],
          eyebrow: ["Who can do what", "谁能做什么"],
          route: "/app/admin/users",
          intro: [
            "Create an account, change someone's role, reset a password, or switch access off the moment someone leaves. Each name opens to their own record and activity.",
            "创建账号、变更角色、重置密码，或在员工离职时立即停用权限。点击姓名可查看其个人记录和操作历史。",
          ],
          figure: { shot: "staff-hero", crop: true },
          keys: [
            { n: 1, title: ["Role", "角色"], body: ["Decides every screen that person can reach. Changing it changes their whole system.", "决定该员工能进入的所有界面。修改角色即改变其整个系统视图。"] },
            { n: 2, title: ["Access", "权限状态"], body: ["Switch it off the day someone leaves. Their record and history stay.", "员工离职当天即停用。其记录和历史仍然保留。"] },
            { n: 3, title: ["Your own row", "你自己的那一行"], body: ["Rendered as a badge, not a dropdown. You cannot change your own role or deactivate yourself.", "显示为标签而非下拉框。你无法修改自己的角色或停用自己。"] },
          ],
          callout: {
            kind: "tip",
            text: [
              "New Guangzhou accounts open in Chinese automatically; every Tanzanian desk opens in English. Whatever the person chooses afterwards is stored against them and wins.",
              "新建的广州账号默认中文；坦桑尼亚各岗位默认英文。员工之后自行选择的语言会保存在其账号上并优先生效。",
            ],
          },
        },
        {
          kind: "screen",
          title: ["Deleted records — restore or erase", "已删除记录——恢复或清除"],
          eyebrow: ["Nothing is destroyed by a delete", "删除不会销毁数据"],
          route: "/app/admin/deleted",
          intro: [
            "Every soft-deleted consignment, with the reason, who deleted it, and its photographs preserved. An ordinary delete is a timestamp, a person and a reason — *nothing is destroyed*.",
            "所有软删除的货物，附带删除原因、操作人，照片全部保留。普通删除只是记录时间、人员和理由——*数据不会被销毁*。",
          ],
          figure: { shot: "deleted-hero", crop: true },
          callout: {
            kind: "stop",
            text: [
              "Permanent erasure refuses a record that is not already deleted, one with any invoice against it, and one that flew on a dispatched flight — and it demands the tracking number typed exactly. *Every one of those refusals is protecting the record, not obstructing you.*",
              "永久清除会拒绝：尚未删除的记录、有任何账单的记录、已随航班发运的记录——并要求准确输入运单号。*每一条拒绝都是在保护记录，而不是阻碍你。*",
            ],
          },
        },
        {
          kind: "screen",
          title: ["Company settings & Pricing", "公司设置与价格"],
          eyebrow: ["What customers are told", "客户看到的信息"],
          route: "/app/admin/settings · /app/finance/pricing",
          intro: [
            "Collection accounts, the Tanzania and China office addresses, and the contact numbers. Pricing is the rate book every quote comes from — change a figure there and cargo, invoices, tracking and reports all follow.",
            "收款账户、坦桑尼亚和中国办公地址，以及联系电话。价格页是全公司报价的来源——在那里修改一个数字，货物、账单、追踪和报表都会随之变化。",
          ],
          figure: { shot: "settings-hero", crop: true },
          callout: {
            kind: "warn",
            text: [
              "Saving an empty account list is refused outright: *an invoice with nowhere to pay is worse than no invoice.* Invoices already raised keep the accounts they were issued with. Add the new account before removing the old.",
              "保存空的账户列表会被直接拒绝：*一张无处付款的账单比没有账单更糟。* 已开出的账单仍保留当时的账户信息。请先添加新账户，再删除旧账户。",
            ],
          },
        },
        {
          kind: "screen",
          title: ["Audit log — settling arguments", "审计日志——解决争议"],
          eyebrow: ["Append-only, including for you", "只增不改，对你也一样"],
          route: "/app/admin/audit",
          intro: [
            "Every privileged action, searchable by summary, action or user, and filterable to shipments, batches, invoices, payments, pickup notes or staff.",
            "每一项特权操作，可按摘要、操作或用户搜索，并可按运单、批次、账单、收款、提货单或员工筛选。",
          ],
          figure: { shot: "audit-hero", crop: true },
          callout: {
            kind: "stop",
            text: [
              "Nothing here can be edited or removed — *including by you*. If a mistake is in the log, the fix is a new entry, never a correction. That is the only defence against “the number changed and nobody knows when”.",
              "这里的任何内容都无法编辑或删除——*包括你本人*。如果日志中有错误，纠正方式是新增一条记录，而不是修改。这是防止“数字变了却没人知道何时变的”唯一手段。",
            ],
          },
        },
      ],
    },

    {
      title: ["The complete journey", "完整流程"],
      blurb: ["What every desk below you is doing, and where you sit in it.", "你下面每个岗位在做什么，以及你的位置。"],
      pages: [
        {
          title: ["Fifteen steps, five departments", "十五步，五个部门"],
          eyebrow: ["End to end", "全流程"],
          blocks: [
            {
              type: "flow",
              steps: [
                { who: ["Customer", "客户"], what: ["Books on the website", "在官网下单"], tone: "draft" },
                { who: ["Guangzhou", "广州"], what: ["Weigh · photograph · register", "称重 · 拍照 · 登记"], tone: "draft" },
                { who: ["Guangzhou", "广州"], what: ["Print labels, one per box", "打印标签，每箱一张"], tone: "draft" },
                { who: ["Guangzhou", "广州"], what: ["Seal and dispatch", "封批发运"], tone: "draft" },
                { who: ["In the air", "空运中"], what: ["China → Tanzania", "中国 → 坦桑尼亚"], tone: "owed" },
                { who: ["Dar floor", "达市仓"], what: ["Land and check in the flight", "接收并核对航班"], tone: "owed" },
                { who: ["System", "系统"], what: ["Priced automatically as a draft", "自动计价为草稿"], tone: "owed" },
                { who: ["Finance", "财务"], what: ["Confirm the price → invoice", "确认价格 → 账单"], tone: "owed" },
                { who: ["Customer Care", "客服"], what: ["Chase the customer", "催收客户"], tone: "owed" },
                { who: ["Customer Care", "客服"], what: ["Submit the claim with proof", "提交带凭证的收款申报"], tone: "owed" },
                { who: ["Finance", "财务"], what: ["Verify · receipt · pickup note", "核实 · 收据 · 提货单"], tone: "paid" },
                { who: ["Dar floor", "达市仓"], what: ["Scan · photograph · hand over", "扫码 · 拍照 · 交货"], tone: "paid" },
                { who: ["You", "你"], what: ["Approve payouts and big costs", "批准赔付和大额支出"], tone: "info",
                  note: ["Only where a decision has a cost attached.", "仅在决定涉及成本时。"] },
                { who: ["You", "你"], what: ["Read the position and the profit", "查看经营状况和利润"], tone: "info" },
                { who: ["You", "你"], what: ["Settle arguments from the log", "依据日志解决争议"], tone: "info" },
              ],
            },
          ],
        },
      ],
    },

    {
      title: ["A worked example", "实例演练"],
      blurb: ["One consignment, and the two places you touch it.", "一票货，以及你介入的两个环节。"],
      pages: [
        {
          title: ["TX-000042 · a claim and a cost", "TX-000042 · 一次索赔与一笔支出"],
          eyebrow: ["Where you come in", "你介入的环节"],
          blocks: [
            {
              type: "example",
              fields: [
                { k: ["Customer", "客户"], v: "John Peter" },
                { k: ["Tracking", "运单号"], v: "TX-000042" },
                { k: ["Invoice", "账单"], v: "USD 48.60" },
                { k: ["Claim", "索赔"], v: "USD 180.00" },
              ],
            },
            {
              type: "table",
              head: [["Stage", "阶段"], ["What you do", "你做什么"]],
              rows: [
                [
                  ["A box is missing", "一箱货缺失"],
                  [
                    "The Dar floor cannot find one of John's two cartons. They press 'Unable to locate', write where they looked, and a case opens automatically. You are notified; they are not able to decide it.",
                    "达市仓找不到 John 两箱货中的一箱。他们点击“未找到货物”，写明查找位置，系统自动开立案件。系统会通知你；他们无权决定。",
                  ],
                ],
                [
                  ["You investigate", "你介入调查"],
                  [
                    "You open Issues & Claims, read the Guangzhou photographs and the check-in record, and assign the case to a named person so it stops being everyone's problem.",
                    "你打开问题与索赔，查看广州的照片和入库记录，并把案件指派给具体负责人，避免无人负责。",
                  ],
                ],
                [
                  ["You approve", "你批准"],
                  [
                    "The box is genuinely lost. You approve compensation of USD 180. *This books no money* — it unlocks the payout for Finance.",
                    "确认该箱确实丢失。你批准赔偿 180 美元。*此操作不入账*——它只是为财务解锁付款。",
                  ],
                ],
                [
                  ["Finance pays", "财务付款"],
                  [
                    "Finance disburses it from a named account. Only now has money actually left the business.",
                    "财务从指定账户支付。此时资金才真正流出公司。",
                  ],
                ],
                [
                  ["You check", "你复核"],
                  [
                    "You open the Audit log and confirm both halves happened: your approval, and Finance's payment. Two entries, two names, two timestamps.",
                    "你打开审计日志，确认两个环节都已完成：你的批准，和财务的付款。两条记录、两个姓名、两个时间戳。",
                  ],
                ],
              ],
            },
          ],
        },
      ],
    },

    {
      title: ["When things go wrong", "出问题的时候"],
      blurb: ["The mistakes this chair actually makes.", "这个岗位真正会犯的错误。"],
      pages: [
        {
          title: ["Common mistakes", "常见错误"],
          eyebrow: ["Fix it this way", "这样纠正"],
          blocks: [
            {
              type: "table",
              head: [["The mistake", "错误"], ["What it causes", "后果"], ["What to do", "怎么做"]],
              rows: [
                [["Doing another desk's work", "替别的岗位做事"], ["Your name lands in the middle of a record that should be theirs.", "你的名字出现在本该属于他们的记录中。"], ["Send it back to the desk that owns it.", "退回给负责该事项的岗位。"]],
                [["Reading the figure, not the problem line", "只看数字，不看问题描述"], ["A busy, healthy desk looks like a crisis; a real one gets missed.", "忙碌但正常的岗位看起来像危机；真正的问题被忽略。"], ["Read the line underneath the number.", "看数字下面那行说明。"]],
                [["Quoting cash profit as profit", "把现金口径当作利润"], ["A month with a big collection reads as a good month when the work lost money.", "收回大额欠款的月份看起来不错，实际业务却在亏损。"], ["Read both bases and say which you mean.", "两种口径都看，并说明你指的是哪一种。"]],
                [["Comparing a shilling card with a dollar card", "先令卡片与美元卡片相比"], ["A conclusion out by a factor of thousands.", "结论会相差上千倍。"], ["Shillings lead; the dollar figure is what the invoice says.", "以先令为主；美元金额是账单上的数字。"]],
                [["Treating approval as payment", "把批准当作付款"], ["You believe money has left when it has not, or the reverse.", "你以为钱已经付了，其实没有，或者相反。"], ["Approve, then confirm Finance actually paid it.", "批准后，再确认财务确实已付款。"]],
                [["Emptying the collection accounts to tidy up", "为整理而清空收款账户"], ["Refused — and if it were not, invoices would have nowhere to pay.", "会被拒绝——否则账单将无处付款。"], ["Add the new account before removing the old.", "先添加新账户，再删除旧账户。"]],
              ],
            },
          ],
        },
      ],
    },

    {
      title: ["Working well", "把工作做好"],
      blurb: ["Habits that keep the whole record worth trusting.", "让整份记录值得信任的习惯。"],
      pages: [
        {
          title: ["Best practice", "最佳实践"],
          eyebrow: ["Do it this way", "这样做"],
          blocks: [
            {
              type: "cards",
              columns: 2,
              items: [
                { label: ["Decide", "决定"], title: ["Decide, do not operate", "只做决定，不做操作"], body: ["If you are registering cargo, a desk below you needs attention instead.", "如果你在登记货物，说明下面某个岗位需要关注。"] },
                { label: ["Both halves", "两个环节"], title: ["Approving is not paying", "批准不等于付款"], body: ["Your signature unlocks the money; Finance moves it. Confirm both happened.", "你的签批只是解锁，财务才动钱。确认两步都完成。"] },
                { label: ["Numbers", "数字"], title: ["Say which number you mean", "说明你用的是哪个数字"], body: ["Two profit bases, two currencies. Most bad decisions here are a comparison, not a calculation.", "两种利润口径、两种货币。这里多数错误决定源于比较，而非计算。"] },
                { label: ["People", "人员"], title: ["Switch access off the same day", "离职当天即停用权限"], body: ["Their record and history stay; only the door closes.", "记录和历史都保留；关闭的只是入口。"] },
                { label: ["Deletion", "删除"], title: ["Restore before you erase", "先恢复，再考虑清除"], body: ["A soft delete keeps everything. Permanent erasure is for genuine mistakes only.", "软删除保留一切。永久清除只用于真正的误操作。"] },
                { label: ["The log", "日志"], title: ["Settle from the record", "依据记录解决问题"], body: ["Append-only, including for you. If a mistake is in it, add an entry — never correct one.", "只增不改，对你也一样。若有错误，新增记录——绝不修改。"] },
              ],
            },
          ],
        },
      ],
    },

    {
      title: ["Questions people ask", "常见问题"],
      blurb: ["The ones that come up in the first month.", "第一个月里最常出现的问题。"],
      pages: [
        {
          title: ["Frequently asked", "常见问答"],
          eyebrow: ["FAQ", "常见问题"],
          blocks: [
            {
              type: "table",
              head: [["Question", "问题"], ["Answer", "解答"]],
              rows: [
                [["Why can I not deactivate my own account?", "为什么我不能停用自己的账号？"], ["Because it would leave the company with no way back into its own system. The refusal is by name.", "因为那会让公司无法再进入自己的系统。系统会明确拒绝。"]],
                [["Can I correct a wrong entry in the audit log?", "我能修改审计日志里的错误吗？"], ["No — including you. Add a new entry explaining it. That immutability is what makes the log worth anything.", "不能——包括你。请新增一条说明记录。正是这种不可修改性让日志有价值。"]],
                [["Why does Finance not see the profit report?", "为什么财务看不到利润报表？"], ["Deliberately withheld. Finance keeps the books; the profit is the owner's question to ask of them.", "刻意不开放。财务负责记账；利润是所有者向他们提问的内容。"]],
                [["How do I change what a customer is charged?", "如何修改对客户的收费？"], ["Price Configuration. Change it there and cargo, invoices, tracking and reports all follow.", "在价格配置页修改。改后货物、账单、追踪和报表都会随之更新。"]],
                [["A staff member has left today.", "有员工今天离职了。"], ["Switch their access off from Staff. Their record and everything they did stays on the system.", "在员工页停用其权限。其记录和所有操作历史都会保留。"]],
                [["Can I delete a customer's whole history?", "我能删除某个客户的全部历史吗？"], ["No, and you should not want to. Permanent erasure refuses anything with an invoice against it.", "不能，也不应该想这么做。永久清除会拒绝任何有账单的记录。"]],
              ],
            },
          ],
        },
      ],
    },

    {
      title: ["Summary", "小结"],
      blurb: ["What to remember when everything else is forgotten.", "即使其他都忘了，也要记住这些。"],
      pages: [
        {
          title: ["This chair in one page", "一页看懂这个岗位"],
          eyebrow: ["Keep this one", "请保留这一页"],
          blocks: [
            {
              type: "cards",
              columns: 3,
              items: [
                { label: ["1", "一"], title: ["Decide, do not operate", "只做决定，不做操作"], body: ["If you are doing another desk's work, that desk needs attention instead.", "如果你在做别的岗位的工作，说明那个岗位才需要关注。"] },
                { label: ["2", "二"], title: ["Approving is not paying", "批准不等于付款"], body: ["Your signature unlocks the money; Finance moves it. Confirm both halves.", "你的签批只是解锁，财务才动钱。确认两步都完成。"] },
                { label: ["3", "三"], title: ["Say which number you mean", "说明你用的是哪个数字"], body: ["Two profit bases, two currencies. Most bad calls here are comparisons.", "两种口径、两种货币。这里多数误判源于比较。"] },
              ],
            },
            {
              type: "callout",
              kind: "tip",
              label: ["If you remember one sentence", "如果只记住一句话"],
              text: [
                "Every other desk is built so it cannot do your job. Keep it that way — the separations are what make the whole record worth trusting.",
                "其他每个岗位的设计都让它无法做你的工作。请保持这样——正是这些分离让整份记录值得信任。",
              ],
            },
          ],
        },
      ],
    },
  ],
};
