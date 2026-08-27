Feature: Blog publication
  As a site visitor
  I want to read the published articles
  so I can judge the author's technical judgment.

  Background:
    Given at least one published article exists

  Scenario: The index lists the articles
    When I visit the blog index
    Then I see the list of articles
    And each article shows its date and reading time

  Scenario: Read a full article
    When I visit the blog index
    And I open the first article
    Then I see the article body
    And the article title is the page's main heading

  Scenario: Drafts are not published
    When I visit the blog index
    Then no listed article is marked as a draft

  Scenario: An address that was never published is a real 404
    When I request an article address that was never published
    Then the response status is 404

  Scenario: A draft is unreachable at its own address
    When I request the draft fixture's address
    Then the response status is 404
