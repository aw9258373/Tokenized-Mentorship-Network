(define-constant ERR-NOT-AUTHORIZED u200)
(define-constant ERR-INVALID-USERNAME u201)
(define-constant ERR-INVALID-EXPERTISE u202)
(define-constant ERR-INVALID-AVAILABILITY u203)
(define-constant ERR-INVALID-ROLE u204)
(define-constant ERR-USER-ALREADY-EXISTS u205)
(define-constant ERR-USER-NOT-FOUND u206)
(define-constant ERR-MAX-USERS-EXCEEDED u207)
(define-constant ERR-INVALID-GOALS u208)
(define-constant ERR-INVALID-SKILLS u209)
(define-constant ERR-INVALID-PROFILE-UPDATE u210)
(define-data-var next-user-id uint u0)
(define-data-var max-users uint u5000)
(define-data-var authority-contract (optional principal) none)
(define-map users
  uint
  {
    id: uint,
    username: (string-utf8 50),
    role: (string-utf8 10),
    expertise: (list 10 (string-utf8 50)),
    availability: uint,
    goals: (list 5 (string-utf8 100)),
    skills: (list 10 (string-utf8 50)),
    timestamp: uint,
    active: bool
  }
)
(define-map users-by-username
  (string-utf8 50)
  uint
)
(define-map user-by-principal
  principal
  uint
)
(define-read-only (get-user (user-id uint))
  (map-get? users user-id)
)
(define-read-only (get-user-by-username (username (string-utf8 50)))
  (match (map-get? users-by-username username)
    id (get-user id)
    none
  )
)
(define-read-only (get-user-by-principal (p principal))
  (match (map-get? user-by-principal p)
    id (get-user id)
    none
  )
)
(define-read-only (is-user-registered (username (string-utf8 50)))
  (is-some (map-get? users-by-username username))
)
(define-read-only (get-user-count)
  (var-get next-user-id)
)
(define-private (validate-username (name (string-utf8 50)))
  (if (and (> (len name) u0) (<= (len name) u50))
      (ok true)
      (err ERR-INVALID-USERNAME))
)
(define-private (validate-role (role (string-utf8 10)))
  (if (or (is-eq role u"mentor") (is-eq role u"mentee"))
      (ok true)
      (err ERR-INVALID-ROLE))
)
(define-private (validate-expertise (exp (list 10 (string-utf8 50))))
  (if (<= (length exp) u10)
      (ok true)
      (err ERR-INVALID-EXPERTISE))
)
(define-private (validate-availability (avail uint))
  (if (<= avail u168)
      (ok true)
      (err ERR-INVALID-AVAILABILITY))
)
(define-private (validate-goals (goals (list 5 (string-utf8 100))))
  (if (<= (length goals) u5)
      (ok true)
      (err ERR-INVALID-GOALS))
)
(define-private (validate-skills (skills (list 10 (string-utf8 50))))
  (if (<= (length skills) u10)
      (ok true)
      (err ERR-INVALID-SKILLS))
)
(define-public (set-authority-contract (contract-principal principal))
  (begin
    (asserts! (not (is-eq contract-principal 'SP000000000000000000002Q6VF78)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-none (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)
(define-public (register-user
  (username (string-utf8 50))
  (role (string-utf8 10))
  (expertise (list 10 (string-utf8 50)))
  (availability uint)
  (goals (list 5 (string-utf8 100)))
  (skills (list 10 (string-utf8 50)))
)
  (let
    (
      (user-id (var-get next-user-id))
      (max-users-allowed (var-get max-users))
    )
    (asserts! (< user-id max-users-allowed) (err ERR-MAX-USERS-EXCEEDED))
    (try! (validate-username username))
    (try! (validate-role role))
    (try! (validate-expertise expertise))
    (try! (validate-availability availability))
    (try! (validate-goals goals))
    (try! (validate-skills skills))
    (asserts! (is-none (map-get? users-by-username username)) (err ERR-USER-ALREADY-EXISTS))
    (asserts! (is-none (map-get? user-by-principal tx-sender)) (err ERR-USER-ALREADY-EXISTS))
    (asserts! (is-some (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (map-set users user-id
      {
        id: user-id,
        username: username,
        role: role,
        expertise: expertise,
        availability: availability,
        goals: goals,
        skills: skills,
        timestamp: block-height,
        active: true
      }
    )
    (map-set users-by-username username user-id)
    (map-set user-by-principal tx-sender user-id)
    (var-set next-user-id (+ user-id u1))
    (print { event: "user-registered", id: user-id })
    (ok user-id)
  )
)
(define-public (update-user-profile
  (user-id uint)
  (new-username (optional (string-utf8 50)))
  (new-expertise (optional (list 10 (string-utf8 50))))
  (new-availability (optional uint))
  (new-goals (optional (list 5 (string-utf8 100))))
)
  (let
    (
      (user (map-get? users user-id))
    )
    (match user
      u
      (begin
        (asserts! (is-eq (get id u) user-id) (err ERR-USER-NOT-FOUND))
        (asserts! (is-eq tx-sender (some tx-sender)) (err ERR-NOT-AUTHORIZED))
        (if (is-some new-username)
          (begin
            (try! (validate-username (unwrap new-username)))
            (asserts! (is-none (map-get? users-by-username (unwrap new-username))) (err ERR-USER-ALREADY-EXISTS))
            (map-delete users-by-username (get username u))
            (map-set users-by-username (unwrap new-username) user-id)
          )
          true
        )
        (map-set users user-id
          {
            id: (get id u),
            username: (if (is-some new-username) (unwrap new-username) (get username u)),
            role: (get role u),
            expertise: (if (is-some new-expertise) (unwrap new-expertise) (get expertise u)),
            availability: (if (is-some new-availability) (unwrap new-availability) (get availability u)),
            goals: (if (is-some new-goals) (unwrap new-goals) (get goals u)),
            skills: (get skills u),
            timestamp: block-height,
            active: (get active u)
          }
        )
        (print { event: "profile-updated", id: user-id })
        (ok true)
      )
      (err ERR-USER-NOT-FOUND)
    )
  )
)
(define-public (deactivate-user (user-id uint))
  (let
    (
      (user (map-get? users user-id))
    )
    (match user
      u
      (begin
        (asserts! (is-eq tx-sender (some tx-sender)) (err ERR-NOT-AUTHORIZED))
        (map-set users user-id
          {
            id: (get id u),
            username: (get username u),
            role: (get role u),
            expertise: (get expertise u),
            availability: (get availability u),
            goals: (get goals u),
            skills: (get skills u),
            timestamp: (get timestamp u),
            active: false
          }
        )
        (print { event: "user-deactivated", id: user-id })
        (ok true)
      )
      (err ERR-USER-NOT-FOUND)
    )
  )
)