---
name: photos-generate
description: Generate images or videos in Higgsfield from an image prompt, quote the credit cost first, wait for the user's "yes", then download the results to a folder. Use when the user says "generate this photo", "make an image of", "render this prompt in Higgsfield", "generate it", "make the photo", "make a video of", "quote this", "how much will this cost", or hands over a prompt to run in Higgsfield.
---

# photos-generate

Generate with Higgsfield, quote before spending, and save every result. Never generate before the user says yes.

## Inputs

- **Prompt**: the image or video prompt to run. If the user gave a short idea rather than a finished prompt, run the `photos-prompt-writer` skill first and use its output.
- **Model, aspect ratio, resolution, count**: use what the user named. Otherwise pick the default the Higgsfield tools report for image generation and say which one in the quote line.
- **Reference image** (optional): a person, product or style image the user attached.
- **Folder**: where to save. Use the folder the user names. If none is named, use `Pictures\Claude Photos` under the user's profile. Create it if it does not exist.
- **Base name**: a short name for the files, from the prompt's subject in lowercase with hyphens. Use `photo` if nothing fits.

## Steps

1. Call Higgsfield `balance`. If there is a reference image, upload it and confirm the upload FIRST, then call `generate_image` with the exact same params you will generate with, including `medias`, plus `get_cost: true`. The quote must match the real job.
2. Show the credit balance and the estimated cost in one short line, then STOP and wait. Do not generate until the user replies "yes".
3. After the "yes", call `generate_image` with those same params minus `get_cost`. Leave `use_unlim` out unless the user said to use free generations. If the call returns `unlim_choice`, ask the user that question instead of guessing.
4. Wait with `jobs_wait` until every job is done or failed. If a job reports a different model than the one chosen, note it in the final line.
5. Download every result into the folder. Name them `<base>_1.png`, `<base>_2.png`, and so on. Never overwrite: if a name is taken, use the next free number. Keep the real file type (png, jpg, mp4 and so on).
6. Finish with one short line: how many saved, credits used, and a clickable `file://` link to each file. Do not embed or preview the images in chat.

## Rules

- A failed job is not retried silently. Report it in the final line with the reason.
- Never spend credits without the "yes" in step 2. A changed prompt, model or count means a new quote and a new "yes".
- If `balance` or the quote fails, stop and report the error. Do not guess a cost.
