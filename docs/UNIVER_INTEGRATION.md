# Univer as primary editor (docs / sheets / presentations / templates)

## Behaviour

| Action | Opens in |
|--------|----------|
| Open docx / doc / odt / rtf / txt | Univer Docs (`kind=writer`) |
| Open xlsx / xls / ods / csv | Univer Sheets (`kind=sheet`) |
| Open pptx / ppt / odp | Univer (`kind=show`, Docs UI until slides preset) |
| New Document / Spreadsheet / Presentation | Univer |
| Use template / Edit template content / Blank template | Univer |
| Native `.imkan` file | IMKAN Office (unchanged) |
| Convert to IMKAN Office | IMKAN Office working copy |
| Header button "Open in IMKAN Office" | IMKAN Office |

## Install

```bash
cd frontend && npm install && npm run dev
```

## File list (copy into project root preserving paths)
