Feature: A report on my own captures

  A real report is usually boring — a run where nothing moved counts every
  variant as unchanged and writes no rows at all. So these scenarios assert what
  holds either way: that the numbers on the page agree with each other and with
  what the page shows when they are zero.

  Background:
    Given this console holds a finished comparison

  @regression
  Scenario: The report opens from the console's own link
    When I visit my console
    And I open the first listed report
    Then the report names itself in its heading

  @regression
  Scenario: The report names both capture sets it compared
    When I open one of my reports
    Then both compared sets are identified above the results

  @regression
  Scenario: The bucket chips account for every variant
    When I open one of my reports
    Then the total chip equals the sum of the buckets beneath it

  @regression
  Scenario: Every bucket chip agrees with what selecting it shows
    When I open one of my reports
    Then selecting each bucket shows its stories or explains why there are none

  @regression
  Scenario: The review denominator excludes the unchanged variants
    When I open one of my reports
    Then the review progress counts every bucket except unchanged

  @regression
  Scenario: The URL carries the review position
    When I open one of my reports
    And I narrow the report to a bucket and a search term
    Then reloading the page restores that bucket and that search term
