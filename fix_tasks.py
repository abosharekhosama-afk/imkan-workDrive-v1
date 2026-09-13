import os

# Fix workflows/tasks/page.tsx - malformed closing tags
path = 'E:/imkan workdrive/imkan-workDrive-v1-last-v/frontend/src/app/files/workflows/tasks/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the malformed closing tags
# Old: ...</div>}</main></div>}
# New: ...</div></main></div>
old_end = '</div>}</main></div>}'
new_end = '</div></main></div>'

if old_end in content:
    content = content.replace(old_end, new_end)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'Fixed closing tags in: {path}')
else:
    print(f'No fix needed for: {path}')

print('Done!')
