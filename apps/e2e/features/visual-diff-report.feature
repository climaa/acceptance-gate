Feature: Visual-diff report

  Background:
    Given a finished comparison report exists

  Scenario: The report summarizes the comparison by bucket
    When I open the report
    Then I see a count chip for every bucket
    And both capture sets are identified above the results

  Scenario: The unstable-story warning is visible
    When I open the report
    Then the corpus warning names the unstable stories

  Scenario: Marking a variant reviewed advances the progress
    When I open the report
    And I mark the first changed story as reviewed
    Then the review progress increases by one

  Scenario: Jumping to the next unreviewed variant
    When I open the report
    And I jump to the next unreviewed variant
    Then an unreviewed story card is scrolled into view

  Scenario: Hiding reviewed variants collapses them
    When I open the report
    And I mark the first changed story as reviewed
    And I hide the reviewed variants
    Then no reviewed story card remains visible

  Scenario: Filtering narrows the report to matching stories
    When I open the report
    And I filter by a story's title
    Then only story cards matching the filter remain visible

  Scenario: A removed variant shows its missing side
    When I open the report
    Then the removed story shows a placeholder for the side it never had

  @desktop
  Scenario: The review loop is keyboard-walkable
    When I open the report
    And I walk the review loop with the keyboard
    Then the walked variant is marked reviewed without a pointer

  Scenario: The comparison modal opens from the compare tools
    When I open the report
    And I open the slider overlay on the first changed story
    Then the comparison modal is open with slider mode active

  Scenario: The modal switches between baseline, candidate and diff
    Given the comparison modal is open
    When I switch the modal to candidate
    Then the modal shows only the candidate shot

  Scenario: Blink mode alternates the two shots
    Given the comparison modal is open
    When I switch the modal to blink
    Then the shot alternates between baseline and candidate

  Scenario: Moving the scrubber moves the divider
    Given the comparison modal is open
    When I move the slider position
    Then the divider follows the scrubber

  Scenario: Escape closes the modal
    Given the comparison modal is open
    When I press escape
    Then the comparison modal is closed

  Scenario: A shared link restores the modal state
    When I open a report link carrying a story and slider mode
    Then the comparison modal is open with slider mode active
