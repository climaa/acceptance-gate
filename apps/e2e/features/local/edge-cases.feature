Feature: Addresses and filters that match nothing

  Safe negatives: each one asks for something that is not there, so none of them
  can touch anything that is.

  @edge-case
  Scenario: An address that is not a report says so and offers the way back
    When I open a report address that does not exist
    Then the page says nothing is there and offers the way back to the console

  @edge-case
  Scenario: A report id the console could never mint is refused the same way
    When I open a report address shaped like a path climb
    Then the page says nothing is there and offers the way back to the console

  @edge-case
  Scenario: A filter that matches nothing empties the report and says so
    Given this console holds a finished comparison
    When I open one of my reports
    And I filter by a term no story can match
    Then the report says no story matches the filter
