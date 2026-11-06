Feature: A comparison is read against its before, and only its before

  A comparison answers what changed between two screenshots. A design board
  answers a different question, whether a screenshot is what was drawn, and is
  read in the set's shot view, where the board opens cropped to the story's
  tile. The comparison links there instead of carrying a board itself.

  Scenario: The comparison offers no design board
    Given a shared comparison link is open
    Then no design board is offered
    And the comparison modes are shown

  Scenario: An added story links to its screenshot beside the design
    Given a comparison of an added story is open
    When I open it beside its design
    Then its after screenshot is shown beside a design board

  Scenario: An old link to the design view opens the comparison
    When I open a comparison link naming the pages board
    Then the comparison against its before is shown
