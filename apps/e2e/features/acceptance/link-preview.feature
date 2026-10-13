@desktop
Feature: Link previews
  As someone pasting a link to this blog into Upwork, LinkedIn, Slack, X or WhatsApp
  I want the link to preview as the page it points at
  so the reader sees what they are about to open.

  Scenario Outline: <page> previews as itself
    When a crawler reads <page>
    Then the preview has a title and a description
    And the preview's address is the page's canonical address
    And the preview's image has an absolute address

    Examples:
      | page                      |
      | the home page             |
      | the blog index            |
      | a later page of the index |
      | the first article         |
      | a tag page                |
      | the about page            |
      | the changelog             |

  Scenario: No two pages preview alike
    When a crawler reads every page in the sitemap
    Then no two pages share a preview title, description or address
    And no two articles share a preview image

  Scenario Outline: <crawler> finds the preview in the first response
    When <crawler> requests every page in the sitemap
    Then every page answers 200 without a redirect
    And every page carries its preview tags inside the server-rendered head

    Examples:
      | crawler                 |
      | facebookexternalhit/1.1 |
      | LinkedInBot/1.0         |

  Scenario: Every preview image is a 1200x630 PNG
    When a crawler reads every page in the sitemap
    Then every preview image answers 200 as a 1200x630 PNG
