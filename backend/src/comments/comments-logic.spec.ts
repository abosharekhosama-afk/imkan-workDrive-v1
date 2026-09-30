import { mentionedMemberIds, threadRootId } from './comments-logic';

describe('comment threads', () => {
  it('matches @name and @email mentions', () => {
    const members = [{ id: '1', name: 'Sara Ali', email: 'sara@example.com' }, { id: '2', name: 'Omar', email: 'omar@example.com' }];
    expect(mentionedMemberIds('Please review @Sara Ali and @omar@example.com', members).sort()).toEqual(['1', '2']);
  });

  it('resolves a reply onto the root comment', () => {
    expect(threadRootId({ id: 'reply', parentId: 'root' })).toBe('root');
    expect(threadRootId({ id: 'root', parentId: null })).toBe('root');
  });
});