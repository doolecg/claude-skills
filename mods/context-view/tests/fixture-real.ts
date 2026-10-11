// A breakdown recorded from a real `claude -p` run (summary detail, claude-haiku-5-5), with paths made generic
// and the long lists cut to a few entries. The grid and category rows are as the engine sent them.
export const REAL_USAGE: any = {
  "startedAt": 1791680147924,
  "context": {
    "tokens": 56232,
    "window": 1000000,
    "percent": 6,
    "breakdown": {
      "categories": [
        {
          "name": "System prompt",
          "tokens": 3246,
          "color": "promptBorder",
          "isDeferred": false,
          "kind": "used"
        },
        {
          "name": "System tools",
          "tokens": 29132,
          "color": "inactive",
          "isDeferred": false,
          "kind": "used"
        },
        {
          "name": "MCP server instructions",
          "tokens": 1475,
          "color": "green_FOR_SUBAGENTS_ONLY",
          "isDeferred": false,
          "kind": "used"
        },
        {
          "name": "MCP tools (deferred)",
          "tokens": 75084,
          "color": "inactive",
          "isDeferred": true,
          "kind": "deferred"
        },
        {
          "name": "System tools (deferred)",
          "tokens": 32902,
          "color": "inactive",
          "isDeferred": true,
          "kind": "deferred"
        },
        {
          "name": "Custom agents",
          "tokens": 306,
          "color": "permission",
          "isDeferred": false,
          "kind": "used"
        },
        {
          "name": "Memory files",
          "tokens": 3343,
          "color": "claude",
          "isDeferred": false,
          "kind": "used"
        },
        {
          "name": "Skills",
          "tokens": 9921,
          "color": "warning",
          "isDeferred": false,
          "kind": "used"
        },
        {
          "name": "Messages",
          "tokens": 8809,
          "color": "purple_FOR_SUBAGENTS_ONLY",
          "isDeferred": false,
          "kind": "used"
        },
        {
          "name": "Autocompact buffer",
          "tokens": 33000,
          "color": "inactive",
          "isDeferred": false,
          "kind": "buffer"
        },
        {
          "name": "Free space",
          "tokens": 910768,
          "color": "promptBorder",
          "isDeferred": false,
          "kind": "free"
        }
      ],
      "totalTokens": 56232,
      "maxTokens": 1000000,
      "rawMaxTokens": 1000000,
      "autocompactSource": "model-default",
      "percentage": 6,
      "gridRows": [
        [
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "System prompt",
            "tokens": 3246,
            "percentage": 0,
            "squareFullness": 0.6492
          },
          {
            "color": "inactive",
            "isFilled": true,
            "categoryName": "System tools",
            "tokens": 29132,
            "percentage": 3,
            "squareFullness": 1
          },
          {
            "color": "inactive",
            "isFilled": true,
            "categoryName": "System tools",
            "tokens": 29132,
            "percentage": 3,
            "squareFullness": 1
          },
          {
            "color": "inactive",
            "isFilled": true,
            "categoryName": "System tools",
            "tokens": 29132,
            "percentage": 3,
            "squareFullness": 1
          },
          {
            "color": "inactive",
            "isFilled": true,
            "categoryName": "System tools",
            "tokens": 29132,
            "percentage": 3,
            "squareFullness": 1
          },
          {
            "color": "inactive",
            "isFilled": true,
            "categoryName": "System tools",
            "tokens": 29132,
            "percentage": 3,
            "squareFullness": 1
          },
          {
            "color": "inactive",
            "isFilled": true,
            "categoryName": "System tools",
            "tokens": 29132,
            "percentage": 3,
            "squareFullness": 0.8264000000000005
          },
          {
            "color": "green_FOR_SUBAGENTS_ONLY",
            "isFilled": true,
            "categoryName": "MCP server instructions",
            "tokens": 1475,
            "percentage": 0,
            "squareFullness": 0.295
          },
          {
            "color": "permission",
            "isFilled": true,
            "categoryName": "Custom agents",
            "tokens": 306,
            "percentage": 0,
            "squareFullness": 0.061200000000000004
          },
          {
            "color": "claude",
            "isFilled": true,
            "categoryName": "Memory files",
            "tokens": 3343,
            "percentage": 0,
            "squareFullness": 0.6686
          },
          {
            "color": "warning",
            "isFilled": true,
            "categoryName": "Skills",
            "tokens": 9921,
            "percentage": 1,
            "squareFullness": 1
          },
          {
            "color": "warning",
            "isFilled": true,
            "categoryName": "Skills",
            "tokens": 9921,
            "percentage": 1,
            "squareFullness": 0.9842
          },
          {
            "color": "purple_FOR_SUBAGENTS_ONLY",
            "isFilled": true,
            "categoryName": "Messages",
            "tokens": 8809,
            "percentage": 1,
            "squareFullness": 1
          },
          {
            "color": "purple_FOR_SUBAGENTS_ONLY",
            "isFilled": true,
            "categoryName": "Messages",
            "tokens": 8809,
            "percentage": 1,
            "squareFullness": 0.7618000000000003
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          }
        ],
        [
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          }
        ],
        [
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          }
        ],
        [
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          }
        ],
        [
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          }
        ],
        [
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          }
        ],
        [
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          }
        ],
        [
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          }
        ],
        [
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          }
        ],
        [
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "promptBorder",
            "isFilled": true,
            "categoryName": "Free space",
            "tokens": 910768,
            "percentage": 91,
            "squareFullness": 1
          },
          {
            "color": "inactive",
            "isFilled": true,
            "categoryName": "Autocompact buffer",
            "tokens": 33000,
            "percentage": 3,
            "squareFullness": 1
          },
          {
            "color": "inactive",
            "isFilled": true,
            "categoryName": "Autocompact buffer",
            "tokens": 33000,
            "percentage": 3,
            "squareFullness": 1
          },
          {
            "color": "inactive",
            "isFilled": true,
            "categoryName": "Autocompact buffer",
            "tokens": 33000,
            "percentage": 3,
            "squareFullness": 1
          },
          {
            "color": "inactive",
            "isFilled": true,
            "categoryName": "Autocompact buffer",
            "tokens": 33000,
            "percentage": 3,
            "squareFullness": 1
          },
          {
            "color": "inactive",
            "isFilled": true,
            "categoryName": "Autocompact buffer",
            "tokens": 33000,
            "percentage": 3,
            "squareFullness": 1
          },
          {
            "color": "inactive",
            "isFilled": true,
            "categoryName": "Autocompact buffer",
            "tokens": 33000,
            "percentage": 3,
            "squareFullness": 1
          },
          {
            "color": "inactive",
            "isFilled": true,
            "categoryName": "Autocompact buffer",
            "tokens": 33000,
            "percentage": 3,
            "squareFullness": 0.6000000000000005
          }
        ]
      ],
      "model": "claude-haiku-5-5",
      "memoryFiles": [
        {
          "path": "C:\\Users\\Dayle Frost\\.claude\\CLAUDE.md",
          "type": "User",
          "tokens": 262
        },
        {
          "path": "C:\\Users\\Dayle Frost\\.claude\\operant-hub\\rules.md",
          "type": "User",
          "tokens": 3081
        }
      ],
      "mcpTools": [
        {
          "name": "mcp__claude_ai_Claude_Docs__batch",
          "serverName": "claude_ai_Claude_Docs",
          "tokens": 202,
          "isLoaded": true
        },
        {
          "name": "mcp__claude_ai_Claude_Docs__create",
          "serverName": "claude_ai_Claude_Docs",
          "tokens": 313,
          "isLoaded": false
        },
        {
          "name": "mcp__claude_ai_Claude_Docs__delete",
          "serverName": "claude_ai_Claude_Docs",
          "tokens": 420,
          "isLoaded": false
        },
        {
          "name": "mcp__claude_ai_Gmail__apply_sensitive_message_label",
          "serverName": "claude_ai_Gmail",
          "tokens": 601,
          "isLoaded": false
        },
        {
          "name": "mcp__claude_ai_Gmail__apply_sensitive_thread_label",
          "serverName": "claude_ai_Gmail",
          "tokens": 529,
          "isLoaded": false
        },
        {
          "name": "mcp__claude_ai_Gmail__create_draft",
          "serverName": "claude_ai_Gmail",
          "tokens": 2103,
          "isLoaded": false
        },
        {
          "name": "mcp__claude_ai_Google_Calendar__create_event",
          "serverName": "claude_ai_Google_Calendar",
          "tokens": 4676,
          "isLoaded": false
        },
        {
          "name": "mcp__claude_ai_Google_Calendar__delete_event",
          "serverName": "claude_ai_Google_Calendar",
          "tokens": 422,
          "isLoaded": false
        },
        {
          "name": "mcp__claude_ai_Google_Calendar__get_event",
          "serverName": "claude_ai_Google_Calendar",
          "tokens": 274,
          "isLoaded": false
        },
        {
          "name": "mcp__claude_ai_Google_Drive__copy_file",
          "serverName": "claude_ai_Google_Drive",
          "tokens": 556,
          "isLoaded": false
        },
        {
          "name": "mcp__claude_ai_Google_Drive__create_file",
          "serverName": "claude_ai_Google_Drive",
          "tokens": 1225,
          "isLoaded": false
        },
        {
          "name": "mcp__claude_ai_Google_Drive__download_file_content",
          "serverName": "claude_ai_Google_Drive",
          "tokens": 630,
          "isLoaded": false
        },
        {
          "name": "mcp__claude_ai_Spotify__generate_playlist",
          "serverName": "claude_ai_Spotify",
          "tokens": 1496,
          "isLoaded": false
        },
        {
          "name": "mcp__claude_ai_Spotify__get_currently_playing",
          "serverName": "claude_ai_Spotify",
          "tokens": 471,
          "isLoaded": false
        },
        {
          "name": "mcp__claude_ai_Spotify__remove_from_library",
          "serverName": "claude_ai_Spotify",
          "tokens": 568,
          "isLoaded": false
        },
        {
          "name": "mcp__codegraph__codegraph_explore",
          "serverName": "codegraph",
          "tokens": 829,
          "isLoaded": false
        },
        {
          "name": "mcp__coolify__cancel_deployment",
          "serverName": "coolify",
          "tokens": 154,
          "isLoaded": false
        },
        {
          "name": "mcp__coolify__control",
          "serverName": "coolify",
          "tokens": 288,
          "isLoaded": false
        },
        {
          "name": "mcp__coolify__coolify_help",
          "serverName": "coolify",
          "tokens": 208,
          "isLoaded": false
        },
        {
          "name": "mcp__git__git_add",
          "serverName": "git",
          "tokens": 154,
          "isLoaded": false
        },
        {
          "name": "mcp__git__git_branch",
          "serverName": "git",
          "tokens": 451,
          "isLoaded": false
        },
        {
          "name": "mcp__git__git_checkout",
          "serverName": "git",
          "tokens": 144,
          "isLoaded": false
        },
        {
          "name": "mcp__hindsight__hindsight_capture_initiative",
          "serverName": "hindsight",
          "tokens": 939,
          "isLoaded": false
        },
        {
          "name": "mcp__hindsight__hindsight_diagnose",
          "serverName": "hindsight",
          "tokens": 241,
          "isLoaded": false
        },
        {
          "name": "mcp__hindsight__hindsight_ingest_document",
          "serverName": "hindsight",
          "tokens": 428,
          "isLoaded": false
        },
        {
          "name": "mcp__playwright__browser_click",
          "serverName": "playwright",
          "tokens": 449,
          "isLoaded": false
        },
        {
          "name": "mcp__playwright__browser_close",
          "serverName": "playwright",
          "tokens": 107,
          "isLoaded": false
        },
        {
          "name": "mcp__playwright__browser_console_messages",
          "serverName": "playwright",
          "tokens": 426,
          "isLoaded": false
        }
      ],
      "agents": [
        {
          "agentType": "code-simplifier:code-simplifier",
          "source": "plugin",
          "tokens": 68
        },
        {
          "agentType": "feature-dev:code-architect",
          "source": "plugin",
          "tokens": 86
        },
        {
          "agentType": "feature-dev:code-explorer",
          "source": "plugin",
          "tokens": 74
        },
        {
          "agentType": "feature-dev:code-reviewer",
          "source": "plugin",
          "tokens": 78
        }
      ],
      "slashCommands": {
        "totalCommands": 257,
        "includedCommands": 257,
        "tokens": 1417
      },
      "skills": {
        "totalSkills": 257,
        "includedSkills": 257,
        "tokens": 9921,
        "skillFrontmatter": [
          {
            "name": "accessibility",
            "source": "userSettings",
            "tokens": 170
          },
          {
            "name": "ai-chat-data-apps",
            "source": "userSettings",
            "tokens": 112
          },
          {
            "name": "ai-governors",
            "source": "userSettings",
            "tokens": 302
          },
          {
            "name": "ai-identifiers",
            "source": "userSettings",
            "tokens": 277
          },
          {
            "name": "ai-inputs",
            "source": "userSettings",
            "tokens": 237
          },
          {
            "name": "ai-trust-builders",
            "source": "userSettings",
            "tokens": 300
          },
          {
            "name": "ai-tuners",
            "source": "userSettings",
            "tokens": 309
          },
          {
            "name": "ai-wayfinders",
            "source": "userSettings",
            "tokens": 12
          },
          {
            "name": "background-delegation-reliability",
            "source": "userSettings",
            "tokens": 169
          },
          {
            "name": "baoyu-comic",
            "source": "userSettings",
            "tokens": 24
          },
          {
            "name": "browser-app-automation",
            "source": "userSettings",
            "tokens": 251
          },
          {
            "name": "builtwith-enrichment",
            "source": "userSettings",
            "tokens": 143
          },
          {
            "name": "citation-sourcing",
            "source": "userSettings",
            "tokens": 6
          },
          {
            "name": "claude-design",
            "source": "userSettings",
            "tokens": 5
          },
          {
            "name": "cognitive-load-conversion",
            "source": "userSettings",
            "tokens": 9
          },
          {
            "name": "company-enrichment",
            "source": "userSettings",
            "tokens": 7
          },
          {
            "name": "computer-use",
            "source": "userSettings",
            "tokens": 5
          },
          {
            "name": "content_brief_creator",
            "source": "userSettings",
            "tokens": 15
          },
          {
            "name": "content-planner",
            "source": "userSettings",
            "tokens": 6
          },
          {
            "name": "content-gen-meta",
            "source": "userSettings",
            "tokens": 14
          }
        ]
      },
      "autoCompactThreshold": 967000,
      "isAutoCompactEnabled": true,
      "apiUsage": {
        "input_tokens": 2,
        "output_tokens": 4,
        "cache_creation_input_tokens": 28422,
        "cache_read_input_tokens": 27808
      }
    }
  },
  "rateLimits": [],
  "cost": {
    "usd": 0.00596468
  }
}
