Feature: The blog, against the posts I am writing

  ⚠️ This scenario WRITES — into `apps/blog/content/posts`, not into
  `.visual-diff`. It creates one post and removes it again, and the fixture
  removes it a second time in teardown so a failed run leaves nothing behind.
  That is the whole blast radius: it never touches a post you wrote.

  What it is here to catch is a claim no built app can make. `apps/blog/proxy.ts`
  decides whether an address exists by reading the posts directory, and it caches
  that read in production — where the content is fixed at deploy — but must not in
  development, where you are editing the tree while the server runs. The
  acceptance lane only ever sees `next start`, so a proxy that cached everywhere
  would pass every scenario there and still leave a post you had just written
  listed on the index and broken at its own address until you restarted.

  One scenario, not three, because this is one claim: the dev server reflects the
  posts directory as it is. Appearing without a restart and disappearing without
  one are the same requirement read in two directions, and an address that was
  never written is the control that stops the whole thing passing on a server
  that says 200 to everything.

  Nothing is named. The probe's slug belongs to the fixture that creates it, and
  no assertion here mentions a post of yours.

  @mutating
  Scenario: The dev server serves the posts directory as it is now
    Given the blog dev server is serving my own content
    When I write a new post into my posts directory
    Then its address answers without restarting the server
    And an address I never wrote is still refused
    When I remove that post again
    Then its address is refused too
