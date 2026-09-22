import { CommentsService } from './comments.service';

describe('Comments collaboration notifications phase 21',()=>{
 it('notifies the file owner and mentioned workspace user', async()=>{
  const prisma:any={file:{findFirst:jest.fn().mockResolvedValue({ownerId:'owner',name:'Plan.docx'})},comment:{findFirst:jest.fn().mockResolvedValue(null),create:jest.fn().mockResolvedValue({id:'c1',user:{name:'Alice',email:'alice@example.com'}})},user:{findMany:jest.fn().mockResolvedValue([{id:'bob',email:'bob@example.com'}])}};
  const notifications:any={createOfficeNotification:jest.fn().mockResolvedValue({})};
  const svc=new CommentsService(prisma,notifications);
  await svc.add({org_id:'org',sub:'alice'} as any,'file','Hello @bob@example.com');
  expect(notifications.createOfficeNotification).toHaveBeenCalledTimes(2);
  expect(notifications.createOfficeNotification).toHaveBeenCalledWith(expect.objectContaining({type:'MENTION',resourceId:'file'}));
 });
});
