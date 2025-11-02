(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-SESSION-ID u101)
(define-constant ERR-INVALID-TIMESTAMP u102)
(define-constant ERR-INVALID-DURATION u103)
(define-constant ERR-INVALID-TOPIC u104)
(define-constant ERR-USER-NOT-REGISTERED u105)
(define-constant ERR-SESSION-NOT-FOUND u106)
(define-constant ERR-SESSION-ALREADY-EXISTS u107)
(define-constant ERR-INVALID-STATUS u108)
(define-constant ERR-MAX-SESSIONS-EXCEEDED u109)
(define-constant ERR-INVALID-RATING u110)
(define-constant ERR-SESSION-NOT-ACTIVE u111)
(define-constant ERR-INVALID-PARTICIPANT u112)
(define-data-var next-session-id uint u0)
(define-data-var max-sessions uint u10000)
(define-data-var authority-contract (optional principal) none)
(define-map sessions
  uint
  {
    mentor: principal,
    mentee: principal,
    start-time: uint,
    duration: uint,
    topic: (string-utf8 100),
    status: (string-utf8 20),
    mentor-rating: uint,
    mentee-rating: uint,
    timestamp: uint,
    interaction-hash: (buff 32)
  }
)
(define-map session-by-participants
  { mentor: principal, mentee: principal }
  uint
)
(define-read-only (get-session (session-id uint))
  (map-get? sessions session-id)
)
(define-read-only (get-session-by-participants (mentor principal) (mentee principal))
  (map-get? session-by-participants { mentor: mentor, mentee: mentee })
)
(define-read-only (get-session-count)
  (var-get next-session-id)
)
(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)
(define-private (validate-duration (dur uint))
  (if (and (> dur u0) (<= dur u1440))
      (ok true)
      (err ERR-INVALID-DURATION))
)
(define-private (validate-topic (topic (string-utf8 100)))
  (if (and (> (len topic) u0) (<= (len topic) u100))
      (ok true)
      (err ERR-INVALID-TOPIC))
)
(define-private (validate-status (status (string-utf8 20)))
  (if (or (is-eq status u"pending") (is-eq status u"active") (is-eq status u"completed") (is-eq status u"cancelled"))
      (ok true)
      (err ERR-INVALID-STATUS))
)
(define-private (validate-rating (rating uint))
  (if (<= rating u5)
      (ok true)
      (err ERR-INVALID-RATING))
)
(define-private (validate-participant (user principal))
  (if (not (is-eq user 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-PARTICIPANT))
)
(define-public (set-authority-contract (contract-principal principal))
  (begin
    (asserts! (not (is-eq contract-principal 'SP000000000000000000002Q6VF78)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-none (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)
(define-public (book-session (mentor principal) (mentee principal) (start-time uint) (duration uint) (topic (string-utf8 100)) (interaction-hash (buff 32)))
  (let
    (
      (session-id (var-get next-session-id))
      (max-sessions-allowed (var-get max-sessions))
    )
    (asserts! (< session-id max-sessions-allowed) (err ERR-MAX-SESSIONS-EXCEEDED))
    (try! (validate-participant mentor))
    (try! (validate-participant mentee))
    (try! (validate-timestamp start-time))
    (try! (validate-duration duration))
    (try! (validate-topic topic))
    (asserts! (is-none (map-get? session-by-participants { mentor: mentor, mentee: mentee })) (err ERR-SESSION-ALREADY-EXISTS))
    (asserts! (is-some (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (map-set sessions session-id
      {
        mentor: mentor,
        mentee: mentee,
        start-time: start-time,
        duration: duration,
        topic: topic,
        status: u"pending",
        mentor-rating: u0,
        mentee-rating: u0,
        timestamp: block-height,
        interaction-hash: interaction-hash
      }
    )
    (map-set session-by-participants { mentor: mentor, mentee: mentee } session-id)
    (var-set next-session-id (+ session-id u1))
    (print { event: "session-booked", id: session-id })
    (ok session-id)
  )
)
(define-public (update-session-status (session-id uint) (new-status (string-utf8 20)))
  (let
    (
      (session (map-get? sessions session-id))
    )
    (match session
      s
      (begin
        (asserts! (or (is-eq (get mentor s) tx-sender) (is-eq (get mentee s) tx-sender)) (err ERR-NOT-AUTHORIZED))
        (try! (validate-status new-status))
        (map-set sessions session-id
          {
            mentor: (get mentor s),
            mentee: (get mentee s),
            start-time: (get start-time s),
            duration: (get duration s),
            topic: (get topic s),
            status: new-status,
            mentor-rating: (get mentor-rating s),
            mentee-rating: (get mentee-rating s),
            timestamp: block-height,
            interaction-hash: (get interaction-hash s)
          }
        )
        (print { event: "session-status-updated", id: session-id, status: new-status })
        (ok true)
      )
      (err ERR-SESSION-NOT-FOUND)
    )
  )
)
(define-public (rate-session (session-id uint) (rating uint))
  (let
    (
      (session (map-get? sessions session-id))
    )
    (match session
      s
      (begin
        (asserts! (is-eq (get status s) u"completed") (err ERR-SESSION-NOT-ACTIVE))
        (asserts! (or (is-eq (get mentor s) tx-sender) (is-eq (get mentee s) tx-sender)) (err ERR-NOT-AUTHORIZED))
        (try! (validate-rating rating))
        (if (is-eq (get mentor s) tx-sender)
          (map-set sessions session-id
            {
              mentor: (get mentor s),
              mentee: (get mentee s),
              start-time: (get start-time s),
              duration: (get duration s),
              topic: (get topic s),
              status: (get status s),
              mentor-rating: rating,
              mentee-rating: (get mentee-rating s),
              timestamp: block-height,
              interaction-hash: (get interaction-hash s)
            }
          )
          (map-set sessions session-id
            {
              mentor: (get mentor s),
              mentee: (get mentee s),
              start-time: (get start-time s),
              duration: (get duration s),
              topic: (get topic s),
              status: (get status s),
              mentor-rating: (get mentor-rating s),
              mentee-rating: rating,
              timestamp: block-height,
              interaction-hash: (get interaction-hash s)
            }
          )
        )
        (print { event: "session-rated", id: session-id, rater: tx-sender, rating: rating })
        (ok true)
      )
      (err ERR-SESSION-NOT-FOUND)
    )
  )
)