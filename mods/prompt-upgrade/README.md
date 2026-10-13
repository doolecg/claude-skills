# Prompt Upgrade

Turns a rough prompt into a great one before it is sent. It opens a pane, asks up to three quick multiple-choice questions, rewrites your prompt, and shows your original and the upgrade side by side. Nothing runs until you press Run it.

Works in the terminal and the Claude desktop app.

## Install

```
/plugin install prompt-upgrade --marketplace doolecg/prompt-upgrade
```

Answer `y` to add the marketplace, then pick the user scope.

## Use

- `/better <rough prompt>` upgrades that prompt.
- `/better` opens a box to type one.
- `/better on` and `/better off` turn automatic mode on and off. When on, what you type goes to the pane first.
- `/better history` shows your last 20 upgrades. Click one to reopen its review.

Slash commands, prompts with attachments, messages sent while Claude is working, and short replies like "yes" pass straight through. Start a prompt with `>` to skip the upgrade.
