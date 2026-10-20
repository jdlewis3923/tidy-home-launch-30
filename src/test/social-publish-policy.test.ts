import { describe, it, expect } from 'vitest';
import { socialBlockReason, type SocialSnapshot } from '../../supabase/functions/_shared/social-publish-policy';
import { AVAILABLE_SERVICES } from '@/lib/service-availability';
const at = Date.parse('2026-10-19T15:00:00Z');
const post = (id: string, offset = 0): SocialSnapshot => ({ id, platform: 'facebook', scheduled_for: new Date(at + offset).toISOString(), caption: id, content_hash: id, image_url: `https://example.com/${id}.jpg`, image_hash: id });
describe('social publish rules', () => {
  it('LinkedIn text posts need no image',()=>expect(socialBlockReason({...post('text'),platform:'linkedin',media_kind:'text',image_url:'',image_hash:''},[],at)).toBeNull());
  it('LinkedIn image posts still require an image',()=>expect(socialBlockReason({...post('image'),platform:'linkedin',media_kind:'image',image_url:''},[],at)).toBe('missing_image'));
  it('different LinkedIn text captions do not repeat empty image hashes',()=>expect(socialBlockReason({...post('text2'),platform:'linkedin',media_kind:'text',image_url:'',image_hash:''},[{...post('text1',-86400000),platform:'linkedin',media_kind:'text',image_url:'',image_hash:''}],at)).toBeNull());
  it('repeated LinkedIn text captions block for 90 days',()=>expect(socialBlockReason({...post('text2'),platform:'linkedin',media_kind:'text',content_hash:'text1',image_url:'',image_hash:''},[{...post('text1',-86400000),platform:'linkedin',media_kind:'text',image_url:'',image_hash:''}],at)).toBe('repeat_within_90_days'));
  it('publishes three chronological image/caption units and blocks identical fourth', () => {
    const history: SocialSnapshot[] = [];
    for (let n=0;n<3;n++) {
      const p=post(`post-${n}`,n*600000);
      expect(socialBlockReason(p,history,at+n*600000)).toBeNull();
      history.push({...p,posted_at:p.scheduled_for,platform_post_id:`dry-${n}`});
    }
    expect(history.map(h=>[h.caption,h.image_url])).toEqual([['post-0','https://example.com/post-0.jpg'],['post-1','https://example.com/post-1.jpg'],['post-2','https://example.com/post-2.jpg']]);
    expect(socialBlockReason({...post('fourth',1800000),content_hash:'post-0',image_hash:'post-0'},history,at+1800000)).toBe('repeat_within_90_days');
  });
  it('blocks missing images',()=>expect(socialBlockReason({...post('a'),image_url:''},[],at)).toBe('missing_image'));
  it('marks a missed slot instead of posting late',()=>expect(socialBlockReason(post('a'),[],at+300001)).toBe('missed'));
  it('cannot retry confirmed platform IDs',()=>expect(socialBlockReason({...post('a'),platform_post_id:'confirmed'},[],at)).toBe('already_confirmed'));
  it('blocks same-platform image reuse for 90 days',()=>expect(socialBlockReason({...post('b'),image_hash:'a'},[{...post('a',-89*86400000),posted_at:new Date(at-89*86400000).toISOString()}],at)).toBe('repeat_within_90_days'));
  it('blocks a repeated caption even with a different image',()=>expect(socialBlockReason({...post('b'),content_hash:'a'},[post('a',-86400000)],at)).toBe('repeat_within_90_days'));
  it('does not block a different platform',()=>expect(socialBlockReason({...post('b'),image_hash:'a'},[{...post('a'),platform:'instagram'}],at)).toBeNull());
  it('allows an image after 90 days',()=>expect(socialBlockReason({...post('b'),image_hash:'a'},[post('a',-91*86400000)],at)).toBeNull());
  it('one post per platform per slot',()=>expect(socialBlockReason(post('b'),[post('a')],at)).toBe('slot_already_used'));
});
describe('reservable services',()=>{
  it('cleaning is available',()=>expect(AVAILABLE_SERVICES.includes('cleaning')).toBe(true));
  it('lawn is available',()=>expect(AVAILABLE_SERVICES.includes('lawn')).toBe(true));
  it('car care is available',()=>expect(AVAILABLE_SERVICES.includes('detailing')).toBe(true));
});